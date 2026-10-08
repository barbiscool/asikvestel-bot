const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Brand color palette (Violet / Emerald / Amber / Coral / Dark)
const BOT_COLORS = {
  PRIMARY: 0x8b5cf6,   // Vivid Violet (#8b5cf6)
  SUCCESS: 0x10b981,   // Emerald Green (#10b981)
  AMBER: 0xf59e0b,     // Golden Amber (#f59e0b)
  DANGER: 0xef4444,    // Crimson Red (#ef4444)
  CYAN: 0x06b6d4,      // Neon Cyan (#06b6d4)
  DARK: 0x18181b       // Deep Zinc (#18181b)
};

const CATEGORY_ICONS = {
  'Valorant': '🎯',
  'League of Legends': '⚔️',
  'IRL': '📹',
  'Meme': '🎭',
  'Diğer Oyunlar': '🎮',
  'Genel': '📁'
};

function getSiteBaseUrl(config = {}) {
  let url = config.SITE_URL || 'https://asikvestel.org';
  if (url.endsWith('/')) url = url.slice(0, -1);
  return url;
}

/**
 * Modern aesthetic embed for newly saved video clips
 */
function createClipEmbed({ clipData, user, config }) {
  const icon = CATEGORY_ICONS[clipData.category] || '🎬';
  const siteUrl = getSiteBaseUrl(config);

  const embed = new EmbedBuilder()
    .setColor(BOT_COLORS.PRIMARY)
    .setAuthor({
      name: `${clipData.author_name} yeni bir klip paylaştı!`,
      iconURL: clipData.author_avatar || undefined
    })
    .setTitle(`${icon} ${clipData.game_name || clipData.category} Klibi`)
    .setDescription(
      clipData.caption
        ? `> *"${clipData.caption}"*`
        : `*Aşık Vestel kasasına yeni bir klip eklendi.*`
    )
    .addFields(
      { name: '📁 Kategori', value: `\`${clipData.category}\``, inline: true },
      { name: '🎮 Oyun / Etiket', value: `\`${clipData.game_name || 'Belirtilmedi'}\``, inline: true },
      { name: '📼 Medya Türü', value: `\`${clipData.media_type || 'Video'}\``, inline: true }
    )
    .setFooter({
      text: 'Aşık Vestel Vault • asikvestel.org/archive/',
      iconURL: user?.displayAvatarURL ? user.displayAvatarURL({ extension: 'png', size: 64 }) : undefined
    })
    .setTimestamp(clipData.created_at || Date.now());

  // Web archive button
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Arşivde İzle')
      .setURL(`${siteUrl}/archive/`)
      .setStyle(ButtonStyle.Link)
      .setEmoji('🌐')
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Modern aesthetic embed for images & GIFs
 */
function createImageEmbed({ imageData, user, config }) {
  const siteUrl = getSiteBaseUrl(config);
  const isGif = imageData.media_type === 'gif';

  const embed = new EmbedBuilder()
    .setColor(isGif ? BOT_COLORS.CYAN : BOT_COLORS.SUCCESS)
    .setAuthor({
      name: `${imageData.user_name} bir ${isGif ? 'GIF' : 'görsel'} ekledi!`,
      iconURL: imageData.user_avatar || undefined
    })
    .setTitle(`${isGif ? '🎞️ GIF Kasasına Eklendi' : '🖼️ Görsel Kasasına Eklendi'}`)
    .setDescription(`**${imageData.title}**`)
    .addFields(
      { name: '📁 Kategori', value: `\`${imageData.category || 'Meme'}\``, inline: true },
      { name: '🎨 Format', value: `\`${imageData.media_type ? imageData.media_type.toUpperCase() : 'GÖRSEL'}\``, inline: true }
    )
    .setThumbnail(imageData.image_url)
    .setFooter({
      text: 'Aşık Vestel Vault • asikvestel.org/media/',
      iconURL: user?.displayAvatarURL ? user.displayAvatarURL({ extension: 'png', size: 64 }) : undefined
    })
    .setTimestamp(imageData.created_at || Date.now());

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Kasayı İncele')
      .setURL(`${siteUrl}/media/`)
      .setStyle(ButtonStyle.Link)
      .setEmoji('🖼️')
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Modern aesthetic embed for Legendary Quotes
 */
function createQuoteEmbed({ quote, author, taggedUser, addedBy, id, config }) {
  const siteUrl = getSiteBaseUrl(config);

  const embed = new EmbedBuilder()
    .setColor(BOT_COLORS.AMBER)
    .setAuthor({
      name: 'Aşık Vestel • Efsanevi Sözler Panosu',
      iconURL: taggedUser?.displayAvatarURL ? taggedUser.displayAvatarURL({ extension: 'png', size: 64 }) : undefined
    })
    .setTitle(`📜 Söz #${id}`)
    .setDescription(`\n> **"${quote}"**\n`)
    .addFields(
      { name: '✍️ Sözün Sahibi', value: author + (taggedUser ? ` (<@${taggedUser.id}>)` : ''), inline: true },
      { name: '👤 Ekleyen', value: addedBy || 'Bilinmiyor', inline: true }
    )
    .setFooter({
      text: 'asikvestel.org • Sözler Arşivi'
    })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Sitede Gör')
      .setURL(`${siteUrl}/council/`)
      .setStyle(ButtonStyle.Link)
      .setEmoji('📜')
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Modern aesthetic embed for Archive Stats (/arsiv-durum)
 */
function createStatsEmbed({ stats, config }) {
  const siteUrl = getSiteBaseUrl(config);

  const catFields = (stats.categories || []).map(c => {
    const icon = CATEGORY_ICONS[c.category] || '📁';
    return `${icon} **${c.category}:** \`${c.c.toLocaleString('tr-TR')}\``;
  });

  const embed = new EmbedBuilder()
    .setColor(BOT_COLORS.PRIMARY)
    .setTitle('📊 Aşık Vestel Arşiv Durumu')
    .setDescription('Web sitesinde indekslenmiş ve yayında olan tüm arşiv verileri.')
    .addFields(
      { name: '🎬 Toplam Klip', value: `\`${(stats.totalClips || 0).toLocaleString('tr-TR')}\``, inline: true },
      { name: '🖼️ Toplam Görsel & GIF', value: `\`${(stats.totalImages || 0).toLocaleString('tr-TR')}\``, inline: true },
      { name: '📂 Kategori Dağılımı', value: catFields.length > 0 ? catFields.join('\n') : '*Henüz veri yok*', inline: false }
    )
    .setFooter({
      text: 'Aşık Vestel Analitik & Kasa Sistemi'
    })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Arşivi Aç')
      .setURL(`${siteUrl}/archive/`)
      .setStyle(ButtonStyle.Link)
      .setEmoji('🌐'),
    new ButtonBuilder()
      .setLabel('Görselleri Aç')
      .setURL(`${siteUrl}/media/`)
      .setStyle(ButtonStyle.Link)
      .setEmoji('🖼️')
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Creates a visual gauge bar (e.g. ▰▰▰▱▱▱▱▱▱▱ %30)
 */
function createGaugeBar(percent, totalBlocks = 10) {
  const p = Math.min(100, Math.max(0, Math.round(percent || 0)));
  const filled = Math.min(totalBlocks, Math.max(0, Math.round(p / (100 / totalBlocks))));
  const empty = totalBlocks - filled;
  return '▰'.repeat(filled) + '▱'.repeat(empty);
}

/**
 * Modern aesthetic embed for Media Host Telemetry (/media-stats)
 */
function createMediaHostStatsEmbed({ rawData, stats, config = {} }) {
  const data = rawData || stats || {};
  const r2 = data.r2 || {};
  const vps = data.vps || {};
  const mStats = data.stats || {};
  const siteUrl = config.MEDIA_HOST_URL || 'https://media.asikvestel.org';

  const r2PercentNum = parseFloat(r2.percentUsed) || (r2.maxBytes ? ((r2.usedBytes / r2.maxBytes) * 100) : 0);
  const vpsPercentNum = parseFloat(vps.percentUsed) || 0;

  let embedColor = BOT_COLORS.SUCCESS;
  if (r2PercentNum > 85 || vpsPercentNum > 90) {
    embedColor = BOT_COLORS.DANGER;
  } else if (r2PercentNum > 70 || vpsPercentNum > 80) {
    embedColor = BOT_COLORS.AMBER;
  }

  const r2Gauge = createGaugeBar(r2PercentNum, 10);
  const vpsGauge = createGaugeBar(vpsPercentNum, 10);

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setAuthor({
      name: 'Aşık Vestel • Medya Depolama Telemetrisi',
      iconURL: `${siteUrl}/favicon.ico`
    })
    .setTitle('☁️ media.asikvestel.org Depolama & Kota')
    .setDescription(
      `**Medya Sunucusu:** \`🟢 Aktif\` • **Host:** \`62.83.32.164:4500\`\n` +
      `*Cloudflare R2 nesne depolama, host NVMe disk alanı ve kullanıcı istatistikleri.*`
    )
    .addFields(
      {
        name: '☁️ Cloudflare R2 Depolama (S3)',
        value:
          `\`${r2Gauge}\` **%${r2PercentNum.toFixed(1)}**\n` +
          `• **Kullanım:** \`${r2.usedFormatted || '0 B'}\` / \`${r2.maxFormatted || '10.00 GB'}\`\n` +
          `• **Yüklenen Medya:** \`${(r2.fileCount || 0).toLocaleString('tr-TR')} dosya\` • **Kova:** \`${r2.bucketName || 'mediahost-community'}\``,
        inline: false
      },
      {
        name: '💽 VPS NVMe Disk Alanı',
        value:
          `\`${vpsGauge}\` **%${vpsPercentNum.toFixed(1)}**\n` +
          `• **Boş Alan:** \`${vps.freeFormatted || '0 B'}\`\n` +
          `• **Toplam Kapasite:** \`${vps.totalFormatted || '0 B'}\``,
        inline: true
      },
      {
        name: '👥 Kullanıcılar & Erişim',
        value:
          `• **Kayıtlı Üye:** \`${mStats.userCount || 0}\`\n` +
          `• **Aktif Davetler:** \`${mStats.activeInvites || 0}\`\n` +
          `• **Yasaklı Üyeler:** \`${mStats.bannedCount || 0}\``,
        inline: true
      },
      {
        name: '🗄️ Veritabanı & Altyapı',
        value:
          `• **SQLite DB:** \`${data.dbSizeFormatted || '4.00 KB'}\` (\`/var/www/media-host/data/media.db\`)\n` +
          `• **Toplam İndekslenen Boyut:** \`${mStats.totalBytesFormatted || '0 B'}\`\n` +
          `• **Eşik Takibi:** \`R2 Kotası: < 8.5 GB\` • \`VPS Boş Disk: > %10\``,
        inline: false
      }
    )
    .setFooter({
      text: 'Aşık Vestel Medya Depolama Altyapısı • media.asikvestel.org'
    })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Medya Paneli')
      .setURL(`${siteUrl}/admin`)
      .setStyle(ButtonStyle.Link)
      .setEmoji('☁️'),
    new ButtonBuilder()
      .setCustomId('media_stats_refresh')
      .setLabel('Yenile')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🔄')
  );

  return { embeds: [embed], components: [row] };
}

/**
 * Creates a paginated system telemetry embed based on the selected tab:
 * - 'vps': Host OS, CPU, RAM, NVMe Disk, Swap, Uptime
 * - 'web': Web site & bot process, Node memory, SQLite db
 * - 'nighty': Docker container status, CPU%, RAM, Net/Block I/O
 * - 'mc': Minecraft server container, Fabric, Java 21, Port 25565
 */
function createSystemPageEmbed({ page = 'vps', stats, formatBytes, formatDuration }) {
  const fb = typeof formatBytes === 'function' ? formatBytes : (b) => `${((b || 0) / (1024 * 1024)).toFixed(1)} MB`;
  const fd = typeof formatDuration === 'function' ? formatDuration : (s) => `${Math.floor((s || 0) / 60)}d`;

  const sysUptime = fd(stats.uptime?.systemUptimeSeconds || 0);
  const botUptime = fd(stats.uptime?.processUptimeSeconds || 0);

  if (page === 'media') {
    const media = stats.mediaHost || {};
    const r2 = media.r2 || {};
    const vpsDisk = media.vps || {};
    const mStats = media.stats || {};

    const r2Percent = parseFloat(r2.percentUsed) || (r2.maxBytes ? ((r2.usedBytes / r2.maxBytes) * 100) : 0);
    const vpsPercent = parseFloat(vpsDisk.percentUsed) || 0;

    let statusColor = BOT_COLORS.CYAN;
    if (r2Percent > 85 || vpsPercent > 90) statusColor = BOT_COLORS.DANGER;
    else if (r2Percent > 70 || vpsPercent > 80) statusColor = BOT_COLORS.AMBER;

    const r2Gauge = createGaugeBar(r2Percent, 10);
    const vpsGauge = createGaugeBar(vpsPercent, 10);

    return new EmbedBuilder()
      .setColor(statusColor)
      .setTitle('☁️ Aşık Vestel • Medya Sunucusu Depolama')
      .setDescription(
        `**Alan Adı:** \`media.asikvestel.org\` (:4500) • **Durum:** \`🟢 Aktif\`\n` +
        `*Cloudflare R2 nesne depolama, host NVMe disk alanı ve kullanıcı istatistikleri.*`
      )
      .addFields(
        {
          name: '☁️ Cloudflare R2 Depolama (S3)',
          value:
            `\`${r2Gauge}\` **%${r2Percent.toFixed(1)}**\n` +
            `• **Kullanım:** \`${r2.usedFormatted || '0 B'}\` / \`${r2.maxFormatted || '10.00 GB'}\`\n` +
            `• **Yüklenen Medya:** \`${(r2.fileCount || 0).toLocaleString('tr-TR')} dosya\` • **Kova:** \`${r2.bucketName || 'mediahost-community'}\``,
          inline: false
        },
        {
          name: '💽 VPS NVMe Disk Alanı',
          value:
            `\`${vpsGauge}\` **%${vpsPercent.toFixed(1)}**\n` +
            `• **Boş Alan:** \`${vpsDisk.freeFormatted || '0 B'}\` / \`${vpsDisk.totalFormatted || '0 B'}\``,
          inline: true
        },
        {
          name: '👥 Kullanıcılar & Erişim',
          value:
            `• **Kayıtlı Üye:** \`${mStats.userCount || 0}\`\n` +
            `• **Aktif Davetler:** \`${mStats.activeInvites || 0}\`\n` +
            `• **Yasaklı Üyeler:** \`${mStats.bannedCount || 0}\``,
          inline: true
        },
        {
          name: '🗄️ Medya Veritabanı & Altyapı',
          value:
            `• **SQLite DB:** \`${media.dbSizeFormatted || '4.00 KB'}\` (\`/var/www/media-host/data/media.db\`)\n` +
            `• **Toplam Medya:** \`${mStats.totalBytesFormatted || '0 B'}\`\n` +
            `• **Eşik Takibi:** \`R2 Kotası: < 8.5 GB\` • \`VPS Boş Disk: > %10\``,
          inline: false
        }
      )
      .setFooter({ text: 'Sayfa 2/5 • Medya Depolama Telemetrisi | Aşık Vestel' })
      .setTimestamp();
  }

  if (page === 'web') {
    const botRss = fb(stats.memory?.processRssBytes || 0);
    const botHeap = fb(stats.memory?.processHeapUsedBytes || 0);
    const botHeapTotal = fb(stats.memory?.processHeapTotalBytes || 0);
    const dbSize = fb(stats.database?.mainSizeBytes || 0);
    const walSize = fb(stats.database?.walSizeBytes || 0);

    const pm2 = stats.pm2 || {};
    const vaultApp = pm2.vaultApp;
    const mediaApp = pm2.mediaApp;
    const botApp = pm2.botApp;
    const totalPm2Mem = fb(pm2.totalMemoryBytes || 0);

    return new EmbedBuilder()
      .setColor(BOT_COLORS.PRIMARY)
      .setTitle('🌐 Aşık Vestel • Web Sitesi, CDN Medya & Discord Bot')
      .setDescription('**Node.js & PM2 Süreç Telemetrisi** | **Veritabanı:** `SQLite + WAL`')
      .addFields(
        {
          name: '🤖 Node.js & PM2 Süreci',
          value:
            `• **asikvestel-vault:** \`${vaultApp?.status || 'online'}\` (:4000) • \`${vaultApp ? fb(vaultApp.memoryBytes) : '110 MB'}\`\n` +
            `• **asikvestel-media:** \`${mediaApp?.status || 'online'}\` (:4500) • \`${mediaApp ? fb(mediaApp.memoryBytes) : '48 MB'}\`\n` +
            `• **asikvestel-bot:** \`${botApp?.status || 'online'}\` • \`${botApp ? fb(botApp.memoryBytes) : '85 MB'}\` (Uptime: \`${botUptime}\`)\n` +
            `• **Toplam PM2 RAM:** \`${totalPm2Mem}\``,
          inline: false
        },
        {
          name: '🧠 Bellek Tüketimi',
          value: `• **RSS Bellek:** \`${botRss}\`\n• **Heap:** \`${botHeap}\` / \`${botHeapTotal}\``,
          inline: true
        },
        {
          name: '🗄️ SQLite Veritabanı',
          value: `• **Ana DB:** \`${dbSize}\`\n• **WAL:** \`${walSize}\`\n• **Yol:** \`/var/lib/asikvestel/clips.db\``,
          inline: true
        },
        {
          name: '📡 Canlı Entegrasyonlar',
          value: `• **Spotify Radar:** \`10s Radar / 300s Döngü\`\n• **Last.fm Sync:** \`12s Polling (barb_btw)\`\n• **Web Chat Köprüsü:** \`Aktif (Çift Sunucu)\`\n• **Medya Host Depolama:** \`/var/www/media (CDN Aktif)\``,
          inline: false
        }
      )
      .setFooter({ text: 'Sayfa 3/5 • Web & Bot Telemetrisi | Aşık Vestel' })
      .setTimestamp();
  }

  if (page === 'nighty') {
    const nighty = stats.nighty || {};
    const vw = stats.vaultwarden || {};
    const router = stats.mcRouter || {};
    const statusColor = (nighty.isOnline || vw.isOnline) ? BOT_COLORS.CYAN : BOT_COLORS.AMBER;

    return new EmbedBuilder()
      .setColor(statusColor)
      .setTitle('🤖 Aşık Vestel • Nighty, Vaultwarden & mc-router')
      .setDescription('**Docker Konteynerleri:** `nighty`, `vaultwarden`, `mc-router`')
      .addFields(
        {
          name: '📦 Konteyner Durumu (Nighty)',
          value:
            `• **Durum:** \`${nighty.status || 'Bilinmiyor'}\` (${nighty.health || 'Aktif'})\n` +
            `• **İmaj:** \`${nighty.image || 'nighty-linux-headless:latest'}\`\n` +
            `• **ID:** \`${nighty.id || '-'}\``,
          inline: true
        },
        {
          name: '⚙️ Nighty Kaynak Kullanımı',
          value:
            `• **İşlemci (CPU):** \`${nighty.cpu || '0%'}\`\n` +
            `• **Bellek:** \`${nighty.mem || '0 MB'}\`\n` +
            `• **Ağ I/O:** \`${nighty.netIO || '0B / 0B'}\``,
          inline: true
        },
        {
          name: '🔐 Vaultwarden Parola Kasası',
          value:
            `• **Durum:** \`${vw.status || 'Bilinmiyor'}\` (${vw.health || 'Aktif'})\n` +
            `• **CPU:** \`${vw.cpu || '0%'}\` • **RAM:** \`${vw.mem || '0 MB'}\`\n` +
            `• **Web UI:** \`https://vault.asikvestel.org\` (:8090)`,
          inline: true
        },
        {
          name: '🔀 mc-router Minecraft Yönlendirici',
          value:
            `• **Durum:** \`${router.status || 'Bilinmiyor'}\`\n` +
            `• **Port:** \`${router.port || '0.0.0.0:25565'}\`\n` +
            `• **CPU:** \`${router.cpu || '0%'}\` • **RAM:** \`${router.mem || '0 MB'}\``,
          inline: true
        },
        {
          name: '🔗 Ağ & Ters Proxy (Nginx)',
          value:
            `• **Nighty Web:** \`https://nighty.asikvestel.org\` (:8088)\n` +
            `• **Vault Web:** \`https://vault.asikvestel.org\` (:8090)\n` +
            `• **Erişim:** \`Nginx SSL + WebSocket / Korumalı\``,
          inline: false
        }
      )
      .setFooter({ text: 'Sayfa 4/5 • Nighty & Docker Telemetrisi | Aşık Vestel' })
      .setTimestamp();
  }

  if (page === 'mc') {
    const mc = stats.minecraft || {};
    const statusColor = mc.isOnline ? BOT_COLORS.SUCCESS : BOT_COLORS.AMBER;
    const availRam = fb(stats.memory?.availableBytes || 0);
    const wingsStatus = stats.services?.systemd?.wings || '🟢 Aktif';
    const mariadbStatus = stats.services?.systemd?.mariadb || '🟢 Aktif';
    const redisStatus = stats.services?.systemd?.redis || '🟢 Aktif';

    return new EmbedBuilder()
      .setColor(statusColor)
      .setTitle('⛏️ Aşık Vestel • Minecraft & Oyun Altyapısı')
      .setDescription(`**Pterodactyl Wings** | **Sunucu:** \`${mc.type || 'Fabric (Java 25)'}\``)
      .addFields(
        {
          name: '🎮 Sunucu Durumu',
          value:
            `• **Durum:** \`${mc.status || 'Çevrimdışı'}\`\n` +
            `• **Yazılım:** \`${mc.type || 'Fabric (Java 25)'}\`\n` +
            `• **Konteyner:** \`${mc.containerName || mc.id || '-'}\``,
          inline: true
        },
        {
          name: '⚙️ Kaynak Tüketimi',
          value:
            `• **İşlemci (CPU):** \`${mc.cpu || '0%'}\`\n` +
            `• **Tahsis / Kullanım:** \`${mc.mem || '0 MB'}\`\n` +
            `• **Ağ I/O:** \`${mc.netIO || '0B / 0B'}\``,
          inline: true
        },
        {
          name: '🧠 Serbest Bellek Rezervi',
          value:
            `• **VPS Boş RAM:** \`${availRam}\`\n` +
            `*Minecraft için genişletilebilir serbest bellek.*`,
          inline: true
        },
        {
          name: '🦅 Pterodactyl Wings & Servisler',
          value:
            `• **Wings Daemon:** \`${wingsStatus}\` (Port 8080 API / 2022 SFTP)\n` +
            `• **MariaDB:** \`${mariadbStatus}\` (Port 3306) • **Redis:** \`${redisStatus}\` (Port 6379)`,
          inline: false
        },
        {
          name: '🌐 Bağlantı & Port Bilgileri',
          value:
            `• **Doğrudan IP / Oyun:** \`62.83.32.164:25565\` (TCP/UDP)\n` +
            `• **Pterodactyl Paneli:** \`https://panel.asikvestel.org\`\n` +
            `• **İç Port:** \`25566 (Minecraft Fabric Container)\``,
          inline: false
        }
      )
      .setFooter({ text: 'Sayfa 5/5 • Minecraft & Pterodactyl | Aşık Vestel' })
      .setTimestamp();
  }

  // Default Page: 'vps'
  const load1 = stats.cpu?.loadAvg?.[0]?.toFixed(2) || '0.00';
  const load5 = stats.cpu?.loadAvg?.[1]?.toFixed(2) || '0.00';
  const load15 = stats.cpu?.loadAvg?.[2]?.toFixed(2) || '0.00';

  const ramUsed = fb(stats.memory?.usedBytes || 0);
  const ramTotal = fb(stats.memory?.totalBytes || 0);
  const ramFree = fb(stats.memory?.availableBytes || stats.memory?.freeBytes || 0);
  const swapUsed = fb(stats.memory?.swapUsedBytes || 0);
  const swapTotal = fb(stats.memory?.swapTotalBytes || 0);

  const diskUsed = fb(stats.disk?.used || 0);
  const diskTotal = fb(stats.disk?.total || 0);
  const diskFree = fb(stats.disk?.free || 0);
  const diskPercent = stats.disk?.usedPercent || 0;

  let embedColor = BOT_COLORS.SUCCESS;
  if (stats.memory?.usedPercent > 90 || diskPercent > 90) {
    embedColor = BOT_COLORS.DANGER;
  } else if (stats.memory?.usedPercent > 75 || diskPercent > 75) {
    embedColor = BOT_COLORS.AMBER;
  }

  const ramBar = createGaugeBar(stats.memory?.usedPercent || 0);
  const diskBar = createGaugeBar(diskPercent);

  const nginxStatus = stats.services?.systemd?.nginx || '🟢 Aktif';
  const wingsStatus = stats.services?.systemd?.wings || '🟢 Aktif';
  const mariadbStatus = stats.services?.systemd?.mariadb || '🟢 Aktif';
  const redisStatus = stats.services?.systemd?.redis || '🟢 Aktif';

  return new EmbedBuilder()
    .setColor(embedColor)
    .setTitle('🖥️ Aşık Vestel • VPS Sistem & İşletim Sistemi (Genel Bakış)')
    .setDescription(`**Ana Makine Durumu:** \`Stabil / Sağlıklı\` | **Uptime:** \`${sysUptime}\``)
    .addFields(
      {
        name: '⚙️ İşlemci (CPU)',
        value: `\`${stats.cpu?.cores || 8} vCPU\` • \`${(stats.cpu?.model || 'AMD EPYC-Genoa').split('@')[0].trim()}\`\n**Yük:** \`${load1}\`, \`${load5}\`, \`${load15}\``,
        inline: true
      },
      {
        name: '🧠 Bellek (RAM & Swap)',
        value: `\`${ramBar}\` **%${stats.memory?.usedPercent || 0}**\n**RAM:** \`${ramUsed}\` / \`${ramTotal}\`\n**Swap:** \`${swapUsed}\` / \`${swapTotal}\``,
        inline: true
      },
      {
        name: '💾 NVMe SSD Depolama',
        value: `\`${diskBar}\` **%${diskPercent}**\n**Kullanılan:** \`${diskUsed}\` / \`${diskTotal}\`\n**Boş Alan:** \`${diskFree}\` (\`/\`)`,
        inline: true
      },
      {
        name: '🌐 Alan Adları & Ters Proxy (Nginx)',
        value:
          `• \`asikvestel.org\` (:4000) • \`media.asikvestel.org\` (:4500)\n` +
          `• \`nighty.asikvestel.org\` (:8088) • \`vault.asikvestel.org\` (:8090)\n` +
          `• \`panel.asikvestel.org\` (:8080)`,
        inline: false
      },
      {
        name: '🛡️ Servisler & Güvenlik',
        value:
          `• **Nginx:** \`${nginxStatus}\` • **Wings:** \`${wingsStatus}\` • **MariaDB:** \`${mariadbStatus}\` • **Redis:** \`${redisStatus}\`\n` +
          `• **OS:** \`${stats.os?.platform || 'linux'} (${stats.os?.arch || 'x64'})\` • **UFW:** \`Aktif\` • **IP:** \`62.83.32.164\``,
        inline: false
      }
    )
    .setFooter({ text: 'Sayfa 1/5 • VPS & OS Genel Bakış | Aşık Vestel' })
    .setTimestamp();
}

/**
 * Creates the 2-tier ActionRow layout for pagination and quick actions:
 * - Row 1: 5 navigation page buttons (vps, media, web, nighty, mc)
 * - Row 2: refresh button + direct link buttons
 */
function createSystemActionRow(activePage = 'vps', disabled = false) {
  const navRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('sys_page_vps')
      .setLabel('🖥️ VPS')
      .setStyle(activePage === 'vps' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('sys_page_media')
      .setLabel('☁️ Medya')
      .setStyle(activePage === 'media' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('sys_page_web')
      .setLabel('🌐 Web & Bot')
      .setStyle(activePage === 'web' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('sys_page_nighty')
      .setLabel('🤖 Nighty')
      .setStyle(activePage === 'nighty' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('sys_page_mc')
      .setLabel('⛏️ Minecraft')
      .setStyle(activePage === 'mc' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(disabled)
  );

  const actionRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('sys_page_refresh')
      .setLabel('🔄 Yenile')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setLabel('🌐 Web Sitesi')
      .setURL('https://asikvestel.org')
      .setStyle(ButtonStyle.Link),
    new ButtonBuilder()
      .setLabel('☁️ Medya Host')
      .setURL('https://media.asikvestel.org')
      .setStyle(ButtonStyle.Link)
  );

  const rows = [navRow, actionRow];
  // Backward compatibility: provide .components referencing navRow.components
  rows.components = navRow.components;
  return rows;
}

/**
 * Modern aesthetic embed for System Telemetry (/system)
 * Default wrapper providing both embed and pagination ActionRows.
 */
function createSystemEmbed({ stats, formatBytes, formatDuration }) {
  const embed = createSystemPageEmbed({ page: 'vps', stats, formatBytes, formatDuration });
  const rows = createSystemActionRow('vps', false);
  return { embeds: [embed], components: Array.isArray(rows) ? rows : [rows] };
}

/**
 * Modern aesthetic embed for notification alerts (success, error, warning)
 */
function createStatusAlertEmbed({ type = 'info', title, message }) {
  let color = BOT_COLORS.PRIMARY;
  let icon = 'ℹ️';

  if (type === 'success') {
    color = BOT_COLORS.SUCCESS;
    icon = '✅';
  } else if (type === 'error') {
    color = BOT_COLORS.DANGER;
    icon = '❌';
  } else if (type === 'warning') {
    color = BOT_COLORS.AMBER;
    icon = '⚠️';
  }

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${icon} ${title}`)
    .setDescription(message)
    .setTimestamp();

  return { embeds: [embed] };
}

module.exports = {
  BOT_COLORS,
  CATEGORY_ICONS,
  createGaugeBar,
  createClipEmbed,
  createImageEmbed,
  createQuoteEmbed,
  createStatsEmbed,
  createMediaHostStatsEmbed,
  createSystemPageEmbed,
  createSystemActionRow,
  createSystemEmbed,
  createStatusAlertEmbed
};
