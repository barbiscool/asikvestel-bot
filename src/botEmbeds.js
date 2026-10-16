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
      .setURL(`${siteUrl}/#konsey`)
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

const GROUP_KINDS = { docker: 'Docker', pm2: 'PM2', systemd: 'Servis', session: 'Oturum' };

/**
 * Load marker for a process group: red at 10% of RAM or 50% of a core, amber at 3% or 10%.
 */
function loadMarker(group, totalBytes) {
  const ramShare = totalBytes ? (group.rssBytes / totalBytes) * 100 : 0;
  if (ramShare >= 10 || group.cpu >= 50) return '🔴';
  if (ramShare >= 3 || group.cpu >= 10) return '🟠';
  return '🟢';
}

/**
 * Joins lines into chunks that fit one embed field (max 1024 characters).
 */
function chunkLines(lines, maxLen = 1000) {
  const chunks = [];
  let cur = '';
  for (const line of lines) {
    if (cur && cur.length + line.length + 1 > maxLen) {
      chunks.push(cur);
      cur = '';
    }
    cur += (cur ? '\n' : '') + line;
  }
  if (cur) chunks.push(cur);
  return chunks;
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
          `• **SQLite DB:** \`${data.dbSizeFormatted || '0 B'}\` (\`${data.dbPath || '/var/lib/asikvestel/media.db'}\`)\n` +
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
 * - 'vps': load, RAM, disk, swap and the top resource users
 * - 'media': media host storage
 * - 'web': PM2 apps (site, CDN, bot), Node memory, SQLite db
 * - 'docker': every running container with live CPU/RAM/IO
 * - 'services': every non-container, non-PM2 task (nginx, wings, mariadb, ...)
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
            `• **SQLite DB:** \`${media.dbSizeFormatted || '0 B'}\` (\`${media.dbPath || '/var/lib/asikvestel/media.db'}\`)\n` +
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

  if (page === 'docker') {
    const containers = stats.allContainers || [];
    const running = containers.filter(c => c.isOnline).length;
    const embed = new EmbedBuilder()
      .setColor(running ? BOT_COLORS.CYAN : BOT_COLORS.AMBER)
      .setTitle('🐳 Aşık Vestel • Docker Konteynerleri')
      .setDescription(`**Çalışan konteyner:** \`${running}\` • canlı \`docker stats\` değerleri`);

    if (!containers.length) {
      embed.addFields({ name: 'Konteyner bulunamadı', value: '`docker` erişilemedi veya çalışan konteyner yok.' });
    }
    for (const c of containers.slice(0, 20)) {
      embed.addFields({
        name: `${c.label || c.name}`,
        value:
          `• **Durum:** \`${c.status}\`\n` +
          `• **CPU:** \`${c.cpu}\` • **RAM:** \`${c.mem}\`\n` +
          `• **Ağ I/O:** \`${c.netIO}\` • **Disk I/O:** \`${c.blockIO}\`\n` +
          `• **İmaj:** \`${c.image}\``,
        inline: false
      });
    }
    return embed
      .setFooter({ text: 'Sayfa 4/5 • Docker Konteynerleri | Aşık Vestel' })
      .setTimestamp();
  }

  if (page === 'services') {
    const groups = (stats.processGroups || []).filter(g => g.kind !== 'docker' && g.kind !== 'pm2');
    const lines = groups.map(g => `• **${g.label}** — \`${fb(g.rssBytes)}\` • CPU \`${g.cpu.toFixed(1)}%\` • ${g.procs} süreç`);
    const systemd = stats.services?.systemd || {};
    const embed = new EmbedBuilder()
      .setColor(BOT_COLORS.PRIMARY)
      .setTitle('⚙️ Aşık Vestel • Sistem Servisleri')
      .setDescription(
        `Konteyner ve PM2 dışında çalışan her şey, RAM'e göre sıralı.\n` +
        `**Nginx:** ${systemd.nginx || '-'} • **Wings:** ${systemd.wings || '-'} • **MariaDB:** ${systemd.mariadb || '-'} • **Redis:** ${systemd.redis || '-'}`
      );

    const chunks = chunkLines(lines, 1000);
    if (!chunks.length) chunks.push('Süreç listesi okunamadı.');
    chunks.forEach((value, i) => embed.addFields({ name: i === 0 ? '🧾 Çalışan Servisler' : '​', value, inline: false }));
    return embed
      .setFooter({ text: 'Sayfa 5/5 • Sistem Servisleri | Aşık Vestel • CPU: süreç ömrü ortalaması' })
      .setTimestamp();
  }

  // Default Page: 'vps'
  const cores = stats.cpu?.cores || 1;
  const load = stats.cpu?.loadAvg || [0, 0, 0];
  const loadPercent = Math.round((load[0] / cores) * 100);
  const [load1, load5, load15] = load.map(v => (v || 0).toFixed(2));

  const ramPercent = stats.memory?.usedPercent || 0;
  const swapTotalBytes = stats.memory?.swapTotalBytes || 0;
  const swapPercent = swapTotalBytes ? Math.round(((stats.memory?.swapUsedBytes || 0) / swapTotalBytes) * 100) : 0;
  const diskPercent = stats.disk?.usedPercent || 0;

  const worst = Math.max(ramPercent, diskPercent, loadPercent);
  let embedColor = BOT_COLORS.SUCCESS;
  if (worst > 90) embedColor = BOT_COLORS.DANGER;
  else if (worst > 75) embedColor = BOT_COLORS.AMBER;

  const top = (stats.processGroups || []).slice(0, 8).map((g) =>
    `${loadMarker(g, stats.memory?.totalBytes)} **${g.label}** — \`${fb(g.rssBytes)}\` • CPU \`${g.cpu.toFixed(1)}%\` • ${GROUP_KINDS[g.kind] || g.kind}`
  );

  return new EmbedBuilder()
    .setColor(embedColor)
    .setTitle('🖥️ Aşık Vestel • VPS Genel Bakış')
    .setDescription(`**Çalışma süresi:** \`${sysUptime}\` • **${cores} vCPU** • \`${(stats.cpu?.model || 'AMD EPYC-Genoa').split('@')[0].trim()}\``)
    .addFields(
      {
        name: '⚙️ İşlemci Yükü',
        value: `\`${createGaugeBar(loadPercent)}\` **%${loadPercent}**\n1/5/15 dk: \`${load1}\` \`${load5}\` \`${load15}\``,
        inline: true
      },
      {
        name: '🧠 RAM',
        value: `\`${createGaugeBar(ramPercent)}\` **%${ramPercent}**\n\`${fb(stats.memory?.usedBytes || 0)}\` / \`${fb(stats.memory?.totalBytes || 0)}\``,
        inline: true
      },
      {
        name: '💾 Disk (/)',
        value: `\`${createGaugeBar(diskPercent)}\` **%${diskPercent}**\n\`${fb(stats.disk?.used || 0)}\` / \`${fb(stats.disk?.total || 0)}\``,
        inline: true
      },
      ...(swapTotalBytes ? [{
        name: '🔁 Swap',
        value: `\`${createGaugeBar(swapPercent)}\` **%${swapPercent}** • \`${fb(stats.memory?.swapUsedBytes || 0)}\` / \`${fb(swapTotalBytes)}\``,
        inline: false
      }] : []),
      {
        name: '🔥 En Çok Kaynak Kullananlar (RAM)',
        value: top.length ? top.join('\n') : 'Süreç listesi okunamadı.',
        inline: false
      }
    )
    .setFooter({ text: 'Sayfa 1/5 • VPS Genel Bakış | Aşık Vestel' })
    .setTimestamp();
}

/**
 * Creates the 2-tier ActionRow layout for pagination and quick actions:
 * - Row 1: 5 navigation page buttons (vps, media, web, docker, services)
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
      .setCustomId('sys_page_docker')
      .setLabel('🐳 Docker')
      .setStyle(activePage === 'docker' ? ButtonStyle.Primary : ButtonStyle.Secondary)
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('sys_page_services')
      .setLabel('⚙️ Servisler')
      .setStyle(activePage === 'services' ? ButtonStyle.Primary : ButtonStyle.Secondary)
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
