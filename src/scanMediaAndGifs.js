const { Client, GatewayIntentBits, Partials, ChannelType } = require('discord.js');
const config = require('./config');
const { extractMedia, extractVaultItems, detectGameAndCategory } = require('./parser');
const { initDb, insertClip, insertImage, updateClipCaption } = require('./db');
const { syncPublicStatsFile } = require('./statsSync');

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const TARGET_CHANNELS = (config.MEDIA_SCAN_CHANNEL_IDS && config.MEDIA_SCAN_CHANNEL_IDS.length > 0)
  ? config.MEDIA_SCAN_CHANNEL_IDS
  : [
      '1508809916905685224',
      '1389232968140062823',
      '1210949927702757447',
      '1072955073421901834'
    ];

const MAX_MESSAGES_PER_CHANNEL = 10000;

async function scanChannel(channel, maxMessages = 10000) {
  let scanned = 0;
  let newClipsAdded = 0;
  let captionsUpdated = 0;
  let imagesAdded = 0;
  let lastId = null;

  console.log(`\n======================================================`);
  console.log(`[MediaScanner] Starting scan for #${channel.name} (ID: ${channel.id})`);
  console.log(`[MediaScanner] Max messages: ${maxMessages} | Files only (Videos, Images, GIFs). No text-only.`);
  console.log(`======================================================`);

  while (scanned < maxMessages) {
    const fetchLimit = Math.min(50, maxMessages - scanned);
    const options = { limit: fetchLimit };
    if (lastId) options.before = lastId;

    let messages;
    try {
      messages = await channel.messages.fetch(options);
    } catch (err) {
      if (err.status === 429) {
        const retryAfter = (err.retryAfter || 5) * 1000;
        console.warn(`[MediaScanner] Discord 429 rate limit. Backing off for ${retryAfter + 2000}ms...`);
        await sleep(retryAfter + 2000);
        continue;
      }
      console.error(`[MediaScanner] Fetch error in #${channel.name}:`, err.message);
      break;
    }

    if (!messages || messages.size === 0) {
      console.log(`[MediaScanner] Reached start of history in #${channel.name}.`);
      break;
    }

    for (const msg of messages.values()) {
      scanned++;
      lastId = msg.id;

      if (msg.author.bot) continue;

      // Extract YouTube link if present
      const media = extractMedia(msg);
      if (media.isVideo && media.mediaType === 'youtube') {
        const { category, gameName } = detectGameAndCategory(msg.content);
        const res = insertClip({
          message_id: msg.id,
          channel_id: msg.channelId,
          author_id: msg.author.id,
          author_name: msg.member ? msg.member.displayName : msg.author.username,
          author_avatar: msg.author.displayAvatarURL ? msg.author.displayAvatarURL({ dynamic: true }) : '',
          category: category,
          game_name: gameName,
          caption: msg.content || '',
          media_type: 'youtube',
          media_url: media.url,
          attachment_id: null,
          message_url: msg.url,
          created_at: msg.createdTimestamp
        });
        if (res && res.changes > 0) newClipsAdded++;
      }

      // Process video attachments (update caption if text exists)
      if (msg.attachments && msg.attachments.size > 0) {
        for (const att of msg.attachments.values()) {
          const filename = (att.name || '').toLowerCase();
          const contentType = (att.contentType || '').toLowerCase();
          const isVideo = 
            contentType.startsWith('video/') ||
            filename.endsWith('.mp4') ||
            filename.endsWith('.mov') ||
            filename.endsWith('.webm');

          if (isVideo) {
            if (msg.content && msg.content.trim()) {
              const upd = updateClipCaption(msg.id, msg.content.trim());
              if (upd && upd.changes > 0) {
                captionsUpdated++;
              }
            }

            const { category, gameName } = detectGameAndCategory(msg.content);
            const res = insertClip({
              message_id: msg.id,
              channel_id: msg.channelId,
              author_id: msg.author.id,
              author_name: msg.member ? msg.member.displayName : msg.author.username,
              author_avatar: msg.author.displayAvatarURL ? msg.author.displayAvatarURL({ dynamic: true }) : '',
              category: category,
              game_name: gameName,
              caption: msg.content || '',
              media_type: 'video_discord',
              media_url: att.url,
              attachment_id: att.id,
              message_url: msg.url,
              created_at: msg.createdTimestamp
            });
            if (res && res.changes > 0) {
              newClipsAdded++;
            }
          }
        }
      }

      // Extract Vault items: GIFs (Tenor, Klipy, Giphy, URLs, files) and images
      const vaultItems = extractVaultItems(msg);
      for (const item of vaultItems) {
        const authorName = msg.member ? msg.member.displayName : msg.author.username;
        const authorAvatar = msg.author.displayAvatarURL ? msg.author.displayAvatarURL({ dynamic: true }) : '';
        const { category } = detectGameAndCategory(msg.content || item.title);

        const textWithoutUrls = (msg.content || '').replace(/https?:\/\/[^\s<>]+/g, '').trim();
        let cardTitle = textWithoutUrls || item.title || (item.mediaType === 'gif' ? `${authorName} - GIF` : `${authorName} - Görsel`);
        cardTitle = cardTitle.slice(0, 150);

        const imgRes = insertImage({
          user_id: msg.author.id,
          user_name: authorName,
          user_avatar: authorAvatar,
          title: cardTitle,
          category: category || (item.mediaType === 'gif' ? 'Meme' : 'Genel'),
          media_type: item.mediaType,
          image_url: item.url,
          attachment_id: item.attachmentId,
          created_at: msg.createdTimestamp
        });

        if (imgRes && imgRes.changes > 0) {
          imagesAdded++;
        }
      }
    }

    if (scanned % 500 === 0 || scanned >= maxMessages) {
      console.log(`[MediaScanner] #${channel.name} progress: ${scanned}/${maxMessages} scanned | Images/GIFs: ${imagesAdded}, New Clips: ${newClipsAdded}, Captions: ${captionsUpdated}`);
    }

    await sleep(1000 + Math.floor(Math.random() * 500));
  }

  console.log(`[MediaScanner] Finished #${channel.name}: Scanned: ${scanned}, Images/GIFs: ${imagesAdded}, New Clips: ${newClipsAdded}, Captions: ${captionsUpdated}`);
  return { scanned, imagesAdded, newClipsAdded, captionsUpdated };
}

async function runMediaScanner() {
  initDb();

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers
    ],
    partials: [Partials.Message, Partials.Channel]
  });

  await client.login(config.BOT_TOKEN);
  console.log(`[MediaScanner] Logged in as ${client.user.tag}`);

  let totalScanned = 0;
  let totalImages = 0;
  let totalClips = 0;
  let totalCaptions = 0;

  for (const channelId of TARGET_CHANNELS) {
    try {
      const channel = await client.channels.fetch(channelId);
      if (!channel || !channel.isTextBased()) {
        console.warn(`[MediaScanner] Channel ${channelId} not found or not text-based.`);
        continue;
      }

      const result = await scanChannel(channel, MAX_MESSAGES_PER_CHANNEL);
      totalScanned += result.scanned;
      totalImages += result.imagesAdded;
      totalClips += result.newClipsAdded;
      totalCaptions += result.captionsUpdated;
    } catch (err) {
      console.error(`[MediaScanner] Failed scanning channel ${channelId}:`, err.message);
    }
  }

  syncPublicStatsFile();

  console.log('\n======================================================');
  console.log('🎉 [MediaScanner] ALL CHANNELS COMPLETED!');
  console.log(`📊 Total Messages Scanned : ${totalScanned}`);
  console.log(`🖼️  Total Unique Images/GIFs: ${totalImages}`);
  console.log(`🎬 Total New Clips Added   : ${totalClips}`);
  console.log(`📝 Total Captions Updated  : ${totalCaptions}`);
  console.log('======================================================\n');

  client.destroy();
}

if (require.main === module) {
  runMediaScanner().catch(err => {
    console.error('[MediaScanner Fatal Error]', err);
    process.exit(1);
  });
}

module.exports = { runMediaScanner };
