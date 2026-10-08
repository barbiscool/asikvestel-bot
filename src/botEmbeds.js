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

  if (page === 'web') {
    const botRss = fb(stats.memory?.processRssBytes || 0);
    const botHeap = fb(stats.memory?.processHeapUsedBytes || 0);
    const botHeapTotal = fb(stats.memory?.processHeapTotalBytes || 0);
    const dbSize = fb(stats.database?.mainSizeBytes || 0);
    const walSize = fb(stats.database?.walSizeBytes || 0);

    return new EmbedBuilder()
      .setColor(BOT_COLORS.PRIMARY)
      .setTitle('🌐 Aşık Vestel • Web Sitesi & Discord Bot')
      .setDescription('**Node.js & PM2 Süreç Telemetrisi** | **Veritabanı:** `SQLite + WAL`')
      .addFields(
        {
          name: '🤖 Node.js & PM2 Süreci',
          value: `**Servis:** \`asikvestel-vault (PM2)\`\n**Uptime:** \`${botUptime}\`\n**Node.js:** \`${stats.os?.nodeVersion || process.version}\`\n**Systemd:** \`pm2-root.service (Aktif)\``,
          inline: true
        },
        {
          name: '🧠 Bellek Tüketimi',
          value: `**RSS Bellek:** \`${botRss}\`\n**Heap Kullanılan:** \`${botHeap}\`\n**Heap Toplam:** \`${botHeapTotal}\``,
          inline: true
        },
        {
          name: '🗄️ SQLite Veritabanı',
          value: `**Konum:** \`/var/lib/asikvestel/clips.db\`\n**Ana DB:** \`${dbSize}\`\n**WAL Günlüğü:** \`${walSize}\``,
          inline: true
        },
        {
          name: '📡 Canlı Entegrasyonlar',
          value: `**Spotify Tracker:** \`10s Radar / 300s Döngü\`\n**Last.fm Sync:** \`12s Polling (barb_btw)\`\n**Web Chat Köprüsü:** \`Aktif (Çift Sunucu)\``,
          inline: false
        }
      )
      .setFooter({ text: 'Sayfa 2/4 • Web & Bot Telemetrisi | Aşık Vestel' })
      .setTimestamp();
  }

  if (page === 'nighty') {
    const nighty = stats.nighty || {};
    const statusColor = nighty.isOnline ? BOT_COLORS.CYAN : BOT_COLORS.AMBER;

    return new EmbedBuilder()
      .setColor(statusColor)
      .setTitle('🤖 Aşık Vestel • Nighty Headless Selfbot')
      .setDescription('**Docker Konteyneri:** `nighty` | **Web UI:** `127.0.0.1:8088`')
      .addFields(
        {
          name: '📦 Konteyner Durumu',
          value: `**Durum:** \`${nighty.status || 'Bilinmiyor'}\`\n**İmaj:** \`${nighty.image || 'nighty-linux-headless:latest'}\`\n**ID:** \`${nighty.id || '-'}\``,
          inline: true
        },
        {
          name: '⚙️ Kaynak Kullanımı',
          value: `**İşlemci (CPU):** \`${nighty.cpu || '0%'}\`\n**Bellek:** \`${nighty.mem || '0 MB'}\``,
          inline: true
        },
        {
          name: '📊 Ağ & Disk I/O',
          value: `**Ağ (Net I/O):** \`${nighty.netIO || '0B / 0B'}\`\n**Disk (Block I/O):** \`${nighty.blockIO || '0B / 0B'}\``,
          inline: true
        },
        {
          name: '🔗 Ağ & Ters Proxy (Nginx)',
          value: `**Web Arayüzü:** \`https://nighty.asikvestel.org\`\n**Protokol:** \`Nginx SSL + WebSocket ($connection_upgrade)\`\n**Erişim:** \`Korumalı / Sadece Yetkili\``,
          inline: false
        }
      )
      .setFooter({ text: 'Sayfa 3/4 • Nighty Docker Telemetrisi | Aşık Vestel' })
      .setTimestamp();
  }

  if (page === 'mc') {
    const mc = stats.minecraft || {};
    const statusColor = mc.isOnline ? BOT_COLORS.SUCCESS : BOT_COLORS.AMBER;
    const availRam = fb(stats.memory?.availableBytes || 0);

    return new EmbedBuilder()
      .setColor(statusColor)
      .setTitle('⛏️ Aşık Vestel • Minecraft & Oyun Altyapısı')
      .setDescription('**Pterodactyl Wings** | **Sunucu:** `Fabric 1.21 (Java 21)`')
      .addFields(
        {
          name: '🎮 Sunucu Durumu',
          value: `**Durum:** \`${mc.status || 'Çevrimdışı'}\`\n**Yazılım:** \`${mc.type || 'Fabric 1.21'}\`\n**Konteyner:** \`${mc.id || '-'}\``,
          inline: true
        },
        {
          name: '⚙️ Kaynak Tüketimi',
          value: `**İşlemci (CPU):** \`${mc.cpu || '0%'}\`\n**Tahsis / Kullanım:** \`${mc.mem || '0 MB'}\``,
          inline: true
        },
        {
          name: '🧠 Serbest Bellek Rezervi',
          value: `**VPS Boş RAM:** \`${availRam}\`\n*Minecraft için genişletilebilir serbest bellek.*`,
          inline: true
        },
        {
          name: '🌐 Bağlantı & Port Bilgileri',
          value: `**Doğrudan IP / Oyun:** \`62.83.32.164:25565\` (TCP/UDP)\n**Pterodactyl Paneli:** \`https://panel.asikvestel.org\`\n**Wings SFTP:** \`Port 2022\` | **Wings API:** \`Port 8080/8443\``,
          inline: false
        }
      )
      .setFooter({ text: 'Sayfa 4/4 • Minecraft & Pterodactyl | Aşık Vestel' })
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

  return new EmbedBuilder()
    .setColor(embedColor)
    .setTitle('🖥️ Aşık Vestel • VPS Sistem & İşletim Sistemi (Genel Bakış)')
    .setDescription(`**Ana Makine Durumu:** \`Stabil / Sağlıklı\` | **Uptime:** \`${sysUptime}\``)
    .addFields(
      {
        name: '⚙️ İşlemci (CPU)',
        value: `**Model:** \`${(stats.cpu?.model || 'AMD EPYC-Genoa').split('@')[0].trim()}\`\n**Çekirdek:** \`${stats.cpu?.cores || 8} vCPU\`\n**Yük (1/5/15 dk):** \`${load1}\`, \`${load5}\`, \`${load15}\``,
        inline: true
      },
      {
        name: '🧠 Bellek (RAM & Swap)',
        value: `\`${ramBar}\` **%${stats.memory?.usedPercent || 0}**\n**Kullanılan:** \`${ramUsed}\` / \`${ramTotal}\`\n**Kullanılabilir:** \`${ramFree}\`\n**Swap:** \`${swapUsed}\` / \`${swapTotal}\``,
        inline: true
      },
      {
        name: '💾 NVMe SSD Depolama',
        value: `\`${diskBar}\` **%${diskPercent}**\n**Kullanılan:** \`${diskUsed}\` / \`${diskTotal}\`\n**Boş Alan:** \`${diskFree}\`\n**Bölüm:** \`/ (Ext4)\``,
        inline: true
      },
      {
        name: '🛡️ Güvenlik & Ağ Durumu',
        value: `**İşletim Sistemi:** \`${stats.os?.platform || 'linux'} (${stats.os?.arch || 'x64'})\` - \`${stats.os?.release || '6.12'}\`\n**Güvenlik Duvarı (UFW):** \`Aktif (22, 80, 443, 25565, 2022)\`\n**Sunucu IP:** \`62.83.32.164 (Cloudflare Proxied)\``,
        inline: false
      }
    )
    .setFooter({ text: 'Sayfa 1/4 • VPS & OS Genel Bakış | Aşık Vestel' })
    .setTimestamp();
}

/**
 * Creates the 5-button ActionRow for pagination
 */
function createSystemActionRow(activePage = 'vps', disabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('sys_page_vps')
      .setLabel('🖥️ VPS & OS')
      .setStyle(activePage === 'vps' ? ButtonStyle.Primary : ButtonStyle.Secondary)
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
      .setDisabled(disabled),
    new ButtonBuilder()
      .setCustomId('sys_page_refresh')
      .setLabel('🔄 Yenile')
      .setStyle(ButtonStyle.Success)
      .setDisabled(disabled)
  );
}

/**
 * Modern aesthetic embed for System Telemetry (/system)
 * Default wrapper providing both embed and pagination ActionRow.
 */
function createSystemEmbed({ stats, formatBytes, formatDuration }) {
  const embed = createSystemPageEmbed({ page: 'vps', stats, formatBytes, formatDuration });
  const row = createSystemActionRow('vps', false);
  return { embeds: [embed], components: [row] };
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
  createSystemPageEmbed,
  createSystemActionRow,
  createSystemEmbed,
  createStatusAlertEmbed
};
