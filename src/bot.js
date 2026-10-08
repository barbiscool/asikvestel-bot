const { Client, GatewayIntentBits, Partials, Options } = require('discord.js');
const { detectCategory, detectGameAndCategory, mapEmojiToCategory, extractMedia, extractVaultItems, refreshParserCatalog } = require('./parser');
const {
  insertClip,
  updateClipCategory,
  getClipByMessageId,
  insertImage,
  getStats,
  upsertDiscordUser,
  upsertDiscordUsersBatch,
  insertQuote,
  insertGameCatalog,
  grantDbFeatureAccess,
  revokeDbFeatureAccess,
  getDbFeatureAccessList,
  updateImageVaultBlob,
  updateClipVaultBlob
} = require('./db');
const { syncPublicStatsFile } = require('./statsSync');
const { initVoiceTracker } = require('./vcTracker');
const { deploySlashCommands } = require('./slashCommands');
const { runThrottledBackfill } = require('./backfill');
const { isAuthorizedAdmin, getSystemStats, formatBytes, formatDuration } = require('./systemStats');
const { initMediaStorageWatchdog, getMediaHostStats } = require('./mediaStorageWatchdog');
const { initDiscordSpotifyTracker } = require('./discordSpotifyTracker');
const { chatBridge } = require('./chatBridge');
const vaultStorage = require('./vaultStorage');
const { fetchMediaBuffer } = require('./vaultWorker');
const {
  createClipEmbed,
  createImageEmbed,
  createQuoteEmbed,
  createStatsEmbed,
  createMediaHostStatsEmbed,
  createSystemPageEmbed,
  createSystemActionRow,
  createSystemEmbed,
  createStatusAlertEmbed
} = require('./botEmbeds');

function createBotClient(config) {
  // Memory & sweep optimizations for Discord.js v14
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMessageReactions,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildVoiceStates,
      GatewayIntentBits.GuildPresences
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
    sweepers: {
      messages: {
        interval: 300, // Sweep unused messages every 5 mins
        lifetime: 1800 // Drop messages older than 30 mins from cache
      }
    },
    makeCache: Options.cacheWithLimits({
      MessageManager: 100, // Limit message cache per channel
      StageInstanceManager: 0,
      ThreadManager: 0,
      AutoModerationRuleManager: 0
    })
  });

  // Debounced user sync queue to minimize SQLite disk writes
  const pendingUsers = new Map();
  let userFlushTimer = null;

  function queueUserUpsert(userData) {
    if (!userData || !userData.discord_id) return;
    pendingUsers.set(userData.discord_id, userData);
    if (!userFlushTimer) {
      userFlushTimer = setTimeout(() => {
        flushPendingUsers();
      }, 5000);
      if (userFlushTimer.unref) userFlushTimer.unref();
    }
  }

  function flushPendingUsers() {
    userFlushTimer = null;
    if (pendingUsers.size === 0) return;
    const usersToSave = Array.from(pendingUsers.values());
    pendingUsers.clear();
    try {
      upsertDiscordUsersBatch(usersToSave);
    } catch (err) {
      console.warn('[Bot] Error flushing user batch:', err.message);
    }
  }

  // Initialize Voice Time Tracker for both servers
  initVoiceTracker(client);

  // Initialize Discord Spotify Presence Tracker (zero-limit, server-wide live tracking)
  initDiscordSpotifyTracker(client);

  // Initialize Web-to-Discord Chat Bridge
  chatBridge.init(client, config);

  client.once('ready', async () => {
    console.log(`[Bot] Logged in as ${client.user.tag}!`);
    await deploySlashCommands(config);
    initMediaStorageWatchdog(client, config);

    // Efficient bulk sync of guild members with single batch transaction
    for (const guild of client.guilds.cache.values()) {
      try {
        const members = await guild.members.fetch().catch(() => null);
        if (members) {
          const batch = [];
          members.forEach(m => {
            if (!m.user?.bot) {
              batch.push({
                discord_id: m.id,
                username: m.user?.username || '',
                display_name: m.displayName || m.user?.displayName || m.user?.username || '',
                avatar_url: m.user?.displayAvatarURL ? m.user.displayAvatarURL({ extension: 'png', size: 128 }) : ''
              });
            }
          });
          if (batch.length > 0) {
            upsertDiscordUsersBatch(batch);
          }
        }
      } catch (err) {
        console.warn(`[Bot] Failed to sync members for guild ${guild.id}:`, err.message);
      }
    }
  });

  client.on('guildMemberUpdate', (oldMember, newMember) => {
    if (newMember.user?.bot) return;
    queueUserUpsert({
      discord_id: newMember.id,
      username: newMember.user?.username || '',
      display_name: newMember.displayName || newMember.user?.displayName || newMember.user?.username || '',
      avatar_url: newMember.user?.displayAvatarURL ? newMember.user.displayAvatarURL({ extension: 'png', size: 128 }) : ''
    });
  });

  // Automatically register commands if joined to a new guild
  client.on('guildCreate', async (guild) => {
    console.log(`[Bot] Joined new guild: ${guild.name} (${guild.id}). Registering slash commands...`);
    await deploySlashCommands(config, guild.id);
  });

  // Live message ingestion
  client.on('messageCreate', async (message) => {
    // Forward all messages in supported chat channels to Web-to-Discord Chat Bridge
    if (chatBridge.isChannelSupported(message.channelId)) {
      chatBridge.handleIncomingMessage(message);
    }

    if (message.author.bot) return;

    queueUserUpsert({
      discord_id: message.author.id,
      username: message.author.username || '',
      display_name: message.member ? message.member.displayName : message.author.username,
      avatar_url: message.author.displayAvatarURL ? message.author.displayAvatarURL({ dynamic: true }) : ''
    });

    // Channel filter: All channels accepted in secondary/new server
    const isNewServer = message.guildId === (config.AV2_GUILD_ID || '1061058726137692332');
    if (!isNewServer) {
      if (config.CLIPS_CHANNELS && config.CLIPS_CHANNELS.length > 0 && !config.CLIPS_CHANNELS.includes(message.channel.id)) {
        return;
      }
    }

    // User requirement: Only messages with files attached; never process or save text-only messages
    const media = extractMedia(message);
    if (media.isVideo) {
      const { category, gameName } = detectGameAndCategory(message.content);
      const clipData = {
        message_id: message.id,
        channel_id: message.channel.id,
        author_id: message.author.id,
        author_name: message.member ? message.member.displayName : message.author.username,
        author_avatar: message.author.displayAvatarURL ? message.author.displayAvatarURL({ dynamic: true }) : '',
        category: category,
        game_name: gameName,
        caption: message.content || '',
        media_type: media.mediaType,
        media_url: media.url,
        attachment_id: media.attachmentId,
        message_url: message.url,
        created_at: message.createdTimestamp
      };

      const clipResult = insertClip(clipData);
      syncPublicStatsFile();
      console.log(`[Bot] Archived clip: "${message.id}" by ${clipData.author_name} [${category} / ${gameName || 'N/A'}]`);

      // Zero-Plaintext Vault: Asynchronously fetch to RAM and encrypt with AES-256-GCM
      if (clipData.media_type === 'video_discord' && clipData.media_url && clipData.media_url.startsWith('http')) {
        (async () => {
          try {
            const buf = await fetchMediaBuffer(clipData.media_url);
            const { blobId } = await vaultStorage.encryptAndSaveBlob(buf);
            if (clipResult && clipResult.lastInsertRowid) {
              updateClipVaultBlob(clipResult.lastInsertRowid, blobId);
            }
          } catch (vaultErr) {
            console.warn('[Bot] Failed to auto-encrypt clip to vault:', vaultErr.message);
          }
        })();
      }
    }

    // Check for image or GIF attachments, embeds (Tenor/Klipy/Giphy), and GIF URLs
    const vaultItems = extractVaultItems(message);
    for (const item of vaultItems) {
      const authorName = message.member ? message.member.displayName : message.author.username;
      const authorAvatar = message.author.displayAvatarURL ? message.author.displayAvatarURL({ dynamic: true }) : '';
      const { category } = detectGameAndCategory(message.content || item.title);

      const textWithoutUrls = (message.content || '').replace(/https?:\/\/[^\s<>]+/g, '').trim();
      let cardTitle = textWithoutUrls || item.title || (item.mediaType === 'gif' ? `${authorName} - GIF` : `${authorName} - Görsel`);
      cardTitle = cardTitle.slice(0, 150);

      const imgResult = insertImage({
        user_id: message.author.id,
        user_name: authorName,
        user_avatar: authorAvatar,
        title: cardTitle,
        category: category || (item.mediaType === 'gif' ? 'Meme' : 'Genel'),
        media_type: item.mediaType,
        image_url: item.url,
        attachment_id: item.attachmentId,
        created_at: message.createdTimestamp
      });
      console.log(`[Bot] Saved ${item.mediaType.toUpperCase()} from ${authorName} in #${message.channel.name}`);

      // Zero-Plaintext Vault: Asynchronously fetch to RAM and encrypt with AES-256-GCM
      if (item.url && item.url.startsWith('http')) {
        (async () => {
          try {
            const buf = await fetchMediaBuffer(item.url);
            const { blobId } = await vaultStorage.encryptAndSaveBlob(buf);
            if (imgResult && imgResult.lastInsertRowid) {
              updateImageVaultBlob(imgResult.lastInsertRowid, blobId);
            }
          } catch (vaultErr) {
            console.warn('[Bot] Failed to auto-encrypt image to vault:', vaultErr.message);
          }
        })();
      }
    }
  });

  // Reaction-based category updates
  client.on('messageReactionAdd', async (reaction, user) => {
    if (user.bot) return;
    if (reaction.partial) {
      try { await reaction.fetch(); } catch (e) { return; }
    }

    const emojiName = reaction.emoji.name;
    const mappedCategory = mapEmojiToCategory(emojiName);
    if (mappedCategory) {
      updateClipCategory(reaction.message.id, mappedCategory);
      console.log(`[Bot] Reaction updated clip ${reaction.message.id} -> ${mappedCategory}`);
    }
  });

  // Slash commands interactions
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'resim-ekle') {
      await interaction.deferReply({ ephemeral: false });

      const file = interaction.options.getAttachment('dosya');
      const title = interaction.options.getString('baslik');
      const category = interaction.options.getString('kategori') || 'Meme';

      const isGif = (file.name || '').toLowerCase().endsWith('.gif') || (file.contentType || '').includes('gif');
      const imageData = {
        user_id: interaction.user.id,
        user_name: interaction.member ? interaction.member.displayName : interaction.user.username,
        user_avatar: interaction.user.displayAvatarURL ? interaction.user.displayAvatarURL({ dynamic: true }) : '',
        title: title,
        category: category,
        media_type: isGif ? 'gif' : 'image',
        image_url: file.url,
        attachment_id: file.id,
        created_at: Date.now()
      };

      const cmdResult = insertImage(imageData);

      if (file.url && file.url.startsWith('http')) {
        (async () => {
          try {
            const buf = await fetchMediaBuffer(file.url);
            const { blobId } = await vaultStorage.encryptAndSaveBlob(buf);
            if (cmdResult && cmdResult.lastInsertRowid) {
              updateImageVaultBlob(cmdResult.lastInsertRowid, blobId);
            }
          } catch (vaultErr) {
            console.warn('[Bot] Failed to auto-encrypt slash command image to vault:', vaultErr.message);
          }
        })();
      }

      const embedPayload = createImageEmbed({
        imageData,
        user: interaction.user,
        config
      });

      return interaction.editReply(embedPayload);
    }

    if (interaction.commandName === 'clip') {
      await interaction.deferReply({ ephemeral: false });

      const category = interaction.options.getString('kategori');
      const text = interaction.options.getString('baslik') || '';
      const contentUrl = interaction.options.getString('icerik');
      const file = interaction.options.getAttachment('dosya');

      let mediaType = 'none';
      let mediaUrl = '';
      let attachmentId = null;

      if (file) {
        mediaType = 'video_discord';
        mediaUrl = file.url;
        attachmentId = file.id;
      } else if (contentUrl) {
        const fakeMsg = { content: contentUrl, attachments: new Map() };
        const extracted = extractMedia(fakeMsg);
        if (extracted.isVideo) {
          mediaType = extracted.mediaType;
          mediaUrl = extracted.url;
        }
      }

      if (mediaType === 'none') {
        const alert = createStatusAlertEmbed({
          type: 'error',
          title: 'Geçersiz Medya',
          message: 'Lütfen geçerli bir video dosyası (MP4/MOV) yükleyin veya YouTube bağlantısı girin.'
        });
        return interaction.editReply(alert);
      }

      const replyMsg = await interaction.fetchReply();

      const clipData = {
        message_id: replyMsg.id,
        channel_id: interaction.channelId,
        author_id: interaction.user.id,
        author_name: interaction.member ? interaction.member.displayName : interaction.user.username,
        author_avatar: interaction.user.displayAvatarURL ? interaction.user.displayAvatarURL({ dynamic: true }) : '',
        category: category,
        game_name: null,
        caption: text,
        media_type: mediaType,
        media_url: mediaUrl,
        attachment_id: attachmentId,
        message_url: replyMsg.url,
        created_at: Date.now()
      };

      const clipResult = insertClip(clipData);
      syncPublicStatsFile();

      if (clipData.media_type === 'video_discord' && clipData.media_url && clipData.media_url.startsWith('http')) {
        (async () => {
          try {
            const buf = await fetchMediaBuffer(clipData.media_url);
            const { blobId } = await vaultStorage.encryptAndSaveBlob(buf);
            if (clipResult && clipResult.lastInsertRowid) {
              updateClipVaultBlob(clipResult.lastInsertRowid, blobId);
            }
          } catch (vaultErr) {
            console.warn('[Bot] Failed to auto-encrypt slash command clip to vault:', vaultErr.message);
          }
        })();
      }

      const embedPayload = createClipEmbed({
        clipData,
        user: interaction.user,
        config
      });

      return interaction.editReply(embedPayload);
    }

    if (interaction.commandName === 'kategori-degistir') {
      await interaction.deferReply({ ephemeral: true });

      const link = interaction.options.getString('mesaj_linki');
      const newCat = interaction.options.getString('yeni_kategori');
      const match = link.match(/\/(\d+)$/) || [null, link];
      const messageId = match[1];

      const clip = getClipByMessageId(messageId);
      if (!clip) {
        const alert = createStatusAlertEmbed({
          type: 'error',
          title: 'Klip Bulunamadı',
          message: `Belirtilen klip (\`${messageId}\`) veritabanında bulunamadı.`
        });
        return interaction.editReply(alert);
      }

      const isBarb = isAuthorizedAdmin(interaction.user, config);
      const isMod = interaction.memberPermissions?.has?.('ManageMessages') || interaction.member?.permissions?.has?.('ManageMessages');
      const isAuthor = clip.author_id && clip.author_id === interaction.user.id;

      if (!isBarb && !isMod && !isAuthor) {
        const alert = createStatusAlertEmbed({
          type: 'warning',
          title: 'Yetkisiz İşlem',
          message: 'Bu klibin kategorisini değiştirme yetkiniz yok. (Yalnızca klip sahibi veya yöneticiler değiştirebilir)'
        });
        return interaction.editReply(alert);
      }

      updateClipCategory(messageId, newCat);
      syncPublicStatsFile();

      const alert = createStatusAlertEmbed({
        type: 'success',
        title: 'Kategori Güncellendi',
        message: `Klip (ID: \`${messageId}\`) kategorisi başarıyla **${newCat}** olarak güncellendi.`
      });
      return interaction.editReply(alert);
    }

    if (interaction.commandName === 'sync-gecmis') {
      if (!isAuthorizedAdmin(interaction.user, config)) {
        return interaction.reply({
          ...createStatusAlertEmbed({
            type: 'error',
            title: 'Yetkisiz Erişim',
            message: 'Bu komut yalnızca yetkili sistem yöneticisine açıktır.'
          }),
          ephemeral: true
        });
      }

      const limit = interaction.options.getInteger('adet') || 200;
      await interaction.deferReply({ ephemeral: true });

      const stats = await runThrottledBackfill(interaction.channel, limit);
      const alert = createStatusAlertEmbed({
        type: 'success',
        title: 'Kanal Taraması Tamamlandı',
        message: `**Taranan Mesaj:** \`${stats.scanned}\`\n**Eklenen Klip:** \`${stats.added}\``
      });
      return interaction.editReply(alert);
    }

    if (interaction.commandName === 'arsiv-durum') {
      if (!isAuthorizedAdmin(interaction.user, config)) {
        return interaction.reply({
          ...createStatusAlertEmbed({
            type: 'error',
            title: 'Yetkisiz Erişim',
            message: 'Bu komut yalnızca yetkili sistem yöneticisine açıktır.'
          }),
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });
      const stats = getStats();
      const embedPayload = createStatsEmbed({ stats, config });
      return interaction.editReply(embedPayload);
    }

    if (interaction.commandName === 'system') {
      if (!isAuthorizedAdmin(interaction.user, config)) {
        return interaction.reply({
          ...createStatusAlertEmbed({
            type: 'error',
            title: 'Yetkisiz Erişim',
            message: 'Bu komut yalnızca yetkili sistem yöneticisine (@imbarb) açıktır.'
          }),
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });
      let currentStats = getSystemStats(config);
      let currentPage = 'vps';

      const initialEmbed = createSystemPageEmbed({
        page: currentPage,
        stats: currentStats,
        formatBytes,
        formatDuration
      });
      const initialRow = createSystemActionRow(currentPage, false);

      const response = await interaction.editReply({
        embeds: [initialEmbed],
        components: Array.isArray(initialRow) ? initialRow : [initialRow]
      });

      // Interactive component collector for 5 minutes (300,000 ms)
      try {
        const collector = response.createMessageComponentCollector({
          filter: i => i.user.id === interaction.user.id,
          time: 300_000
        });

        collector.on('collect', async i => {
          try {
            if (i.customId === 'sys_page_vps') currentPage = 'vps';
            else if (i.customId === 'sys_page_media') currentPage = 'media';
            else if (i.customId === 'sys_page_web') currentPage = 'web';
            else if (i.customId === 'sys_page_nighty') currentPage = 'nighty';
            else if (i.customId === 'sys_page_mc') currentPage = 'mc';
            else if (i.customId === 'sys_page_refresh') {
              currentStats = getSystemStats(config);
            }

            // Keep metrics fresh on page switch
            if (i.customId !== 'sys_page_refresh') {
              currentStats = getSystemStats(config);
            }

            const pageEmbed = createSystemPageEmbed({
              page: currentPage,
              stats: currentStats,
              formatBytes,
              formatDuration
            });
            const pageRow = createSystemActionRow(currentPage, false);

            await i.update({
              embeds: [pageEmbed],
              components: Array.isArray(pageRow) ? pageRow : [pageRow]
            });
          } catch (compErr) {
            console.error('[System Command Component Error]', compErr);
          }
        });

        collector.on('end', async () => {
          try {
            const disabledRow = createSystemActionRow(currentPage, true);
            await interaction.editReply({
              components: Array.isArray(disabledRow) ? disabledRow : [disabledRow]
            }).catch(() => {});
          } catch {}
        });
      } catch (colErr) {
        console.warn('[System Collector Error]', colErr);
      }
      return;
    }

    if (interaction.commandName === 'media-stats') {
      await interaction.deferReply({ ephemeral: false });
      let currentStats = getMediaHostStats(config);
      const embedPayload = createMediaHostStatsEmbed({ stats: currentStats, config });

      const response = await interaction.editReply(embedPayload);

      try {
        const collector = response.createMessageComponentCollector({
          filter: i => i.customId === 'media_stats_refresh',
          time: 300_000
        });

        collector.on('collect', async i => {
          try {
            currentStats = getMediaHostStats(config);
            const updatedPayload = createMediaHostStatsEmbed({ stats: currentStats, config });
            await i.update(updatedPayload);
          } catch (compErr) {
            console.error('[Media Stats Refresh Error]', compErr);
          }
        });

        collector.on('end', async () => {
          try {
            const disabledPayload = createMediaHostStatsEmbed({ stats: currentStats, config });
            if (disabledPayload.components && disabledPayload.components[0]) {
              disabledPayload.components[0].components.forEach(c => {
                if (c.data?.custom_id === 'media_stats_refresh') {
                  c.setDisabled(true);
                }
              });
            }
            await interaction.editReply(disabledPayload).catch(() => {});
          } catch {}
        });
      } catch (colErr) {
        console.warn('[Media Stats Collector Error]', colErr);
      }
      return;
    }

    if (interaction.commandName === 'soz-ekle') {
      await interaction.deferReply({ ephemeral: false });

      const text = interaction.options.getString('soz');
      const author = interaction.options.getString('yazar');
      const taggedUser = interaction.options.getUser('kisi');
      const discordId = taggedUser ? taggedUser.id : null;

      try {
        const created = insertQuote({
          quote: text,
          text: text,
          author: author,
          discord_id: discordId,
          author_id: discordId,
          added_by: interaction.user.tag || interaction.user.username,
          enabled: 1
        });

        const embedPayload = createQuoteEmbed({
          quote: text,
          author,
          taggedUser,
          addedBy: interaction.user.displayName || interaction.user.username,
          id: created.id,
          config
        });

        return interaction.editReply(embedPayload);
      } catch (err) {
        console.error('[Bot] Error adding quote:', err);
        const alert = createStatusAlertEmbed({
          type: 'error',
          title: 'Hata',
          message: 'Söz eklenirken veritabanında bir hata oluştu.'
        });
        return interaction.editReply(alert);
      }
    }

    if (interaction.commandName === 'feature') {
      const adminId = config.ADMIN_DISCORD_USER_ID || '735152588801966132';
      const isBarb = interaction.user.id === adminId ||
                     interaction.user.id === '735152588801966132' ||
                     isAuthorizedAdmin(interaction.user, config);

      if (!isBarb) {
        return interaction.reply({
          ...createStatusAlertEmbed({
            type: 'error',
            title: 'Yetkisiz Erişim',
            message: 'Bu komut yalnızca Root Admin (Barb) tarafından kullanılabilir.'
          }),
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const subcommand = interaction.options.getSubcommand();
      const feature = interaction.options.getString('ozellik') || 'wrapped';

      if (subcommand === 'grant') {
        const targetUser = interaction.options.getUser('kullanici');
        if (!targetUser) {
          return interaction.editReply(createStatusAlertEmbed({
            type: 'error',
            title: 'Kullanıcı Bulunamadı',
            message: 'Lütfen geçerli bir kullanıcı seçin.'
          }));
        }

        grantDbFeatureAccess(feature, targetUser.id, interaction.user.tag || interaction.user.username);
        return interaction.editReply(createStatusAlertEmbed({
          type: 'success',
          title: 'Erişim İzni Verildi',
          message: `<@${targetUser.id}> (\`${targetUser.id}\`) kullanıcısına **${feature}** özelliği için erişim izni başarıyla tanımlandı.`
        }));
      }

      if (subcommand === 'revoke') {
        const targetUser = interaction.options.getUser('kullanici');
        if (!targetUser) {
          return interaction.editReply(createStatusAlertEmbed({
            type: 'error',
            title: 'Kullanıcı Bulunamadı',
            message: 'Lütfen geçerli bir kullanıcı seçin.'
          }));
        }

        if (targetUser.id === adminId || targetUser.id === '735152588801966132') {
          return interaction.editReply(createStatusAlertEmbed({
            type: 'error',
            title: 'İşlem Engellendi',
            message: 'Root Admin (Barb) yetkisi kaldırılamaz!'
          }));
        }

        const revoked = revokeDbFeatureAccess(feature, targetUser.id);
        if (revoked) {
          return interaction.editReply(createStatusAlertEmbed({
            type: 'warning',
            title: 'Erişim İzni Kaldırıldı',
            message: `<@${targetUser.id}> kullanıcısının **${feature}** özelliği izni iptal edildi.`
          }));
        } else {
          return interaction.editReply(createStatusAlertEmbed({
            type: 'info',
            title: 'Bilgi',
            message: `<@${targetUser.id}> kullanıcısının zaten aktif bir **${feature}** izni bulunmuyordu.`
          }));
        }
      }

      if (subcommand === 'list') {
        const list = getDbFeatureAccessList(feature);
        if (!list || list.length === 0) {
          return interaction.editReply(createStatusAlertEmbed({
            type: 'info',
            title: 'Özellik İzin Listesi',
            message: `**${feature}** özelliği için veritabanında tanımlı özel izinli kullanıcı bulunmuyor (Root Admin hariç).`
          }));
        }

        const lines = list.map(item => `• <@${item.discord_id}> (\`${item.discord_id}\`) — Veren: \`${item.granted_by || 'Bilinmiyor'}\` (${new Date(item.created_at).toLocaleDateString('tr-TR')})`);
        return interaction.editReply({
          embeds: [{
            color: BOT_COLORS.PRIMARY,
            title: `📋 ${feature.toUpperCase()} İzin Listesi (${list.length})`,
            description: lines.join('\n'),
            timestamp: new Date().toISOString()
          }]
        });
      }
    }

    if (interaction.commandName === 'oyun-ekle') {
      const adminId = config.ADMIN_DISCORD_USER_ID || '735152588801966132';
      const isBarb = interaction.user.id === adminId ||
                     interaction.user.id === '735152588801966132' ||
                     isAuthorizedAdmin(interaction.user, config);

      if (!isBarb) {
        return interaction.reply({
          ...createStatusAlertEmbed({
            type: 'error',
            title: 'Yetkisiz Erişim',
            message: 'Bu komut yalnızca Root Admin (Barb) tarafından kullanılabilir.'
          }),
          ephemeral: true
        });
      }

      await interaction.deferReply({ ephemeral: true });

      const gameName = interaction.options.getString('oyun_adi');
      const category = interaction.options.getString('kategori');
      const keywordsRaw = interaction.options.getString('anahtar_kelimeler') || '';
      const tagsRaw = interaction.options.getString('etiketler') || '';

      const keywords = keywordsRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
      const tags = tagsRaw ? tagsRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean) : [];

      try {
        insertGameCatalog({
          game_name: gameName,
          category: category,
          keywords: keywords,
          tags: tags
        });

        refreshParserCatalog();

        return interaction.editReply(createStatusAlertEmbed({
          type: 'success',
          title: 'Oyun Kataloğa Eklendi',
          message: `🎮 **Oyun:** \`${gameName}\`\n📁 **Kategori:** \`${category}\`\n🔑 **Anahtar Kelimeler:** \`${keywords.join(', ')}\`\n🏷️ **Etiketler:** \`${tags.join(', ') || 'Yok'}\`\n⚡ *Klip ayrıştırıcı anında güncellendi.*`
        }));
      } catch (err) {
        console.error('[Bot] Error adding game to catalog:', err);
        return interaction.editReply(createStatusAlertEmbed({
          type: 'error',
          title: 'Veritabanı Hatası',
          message: 'Oyun eklenirken bir hata meydana geldi.'
        }));
      }
    }
  });

  return client;
}

module.exports = { createBotClient };
