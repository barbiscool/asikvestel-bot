/**
 * src/mediaStorageWatchdog.js
 * 
 * Local Storage Watchdog & Admin Alerting for Aşık Vestel Media Host.
 * 
 * Migrated from asikvestel-media-host to asikvestel-bot because both services run
 * directly on the same VPS (62.83.32.164). This allows the Discord bot to:
 * 1. Read the media host SQLite database (/var/www/media-host/data/media.db) locally.
 * 2. Read root VPS disk metrics directly via fs.statfsSync('/').
 * 3. Dispatch direct message alerts to admin (@imbarb) natively via Discord.js client.
 */

const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');
const { BOT_COLORS, createGaugeBar } = require('./botEmbeds');

// Flexible SQLite loader: prefers built-in node:sqlite, falls back to better-sqlite3
let Database;
try {
  const sqlite = require('node:sqlite');
  Database = sqlite.DatabaseSync;
} catch {
  Database = require('better-sqlite3');
}

let startupTimeout = null;
let watchdogInterval = null;
let lastAlertTime = 0;
const ALERT_COOLDOWN_MS = 60 * 60 * 1000; // 1-hour cooldown between duplicate alerts

// Capacity Limits (matching media-host architecture)
const R2_MAX_FREE_BYTES = 10 * 1024 * 1024 * 1024; // 10 GB Free Tier
const R2_ALERT_THRESHOLD_BYTES = 8.5 * 1024 * 1024 * 1024; // 8.5 GB Alert Trigger

/**
 * Formats bytes to human-readable strings.
 */
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}

/**
 * Resolves the absolute path of media.db on the VPS.
 */
function resolveMediaDbPath(config = {}) {
  if (config.MEDIA_DB_PATH) {
    return config.MEDIA_DB_PATH;
  }

  const candidates = [
    process.env.MEDIA_DB_PATH,
    '/var/www/media-host/data/media.db',
    path.resolve(__dirname, '../../media-host/data/media.db'),
    path.resolve(__dirname, '../../../media-host/data/media.db')
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0] || '/var/www/media-host/data/media.db';
}

/**
 * Reads root filesystem disk metrics via statfs.
 */
function readHostDiskSpace() {
  try {
    if (typeof fs.statfsSync === 'function') {
      const s = fs.statfsSync('/');
      const total = s.blocks * s.bsize;
      const free = s.bavail * s.bsize;
      const used = total - (s.bfree * s.bsize);
      const percentFree = total > 0 ? ((free / total) * 100).toFixed(1) : '100.0';
      const percentUsed = total > 0 ? ((used / total) * 100).toFixed(1) : '0.0';

      return {
        totalBytes: total,
        usedBytes: used,
        freeBytes: free,
        percentFree,
        percentUsed,
        freeFormatted: formatBytes(free),
        totalFormatted: formatBytes(total)
      };
    }
  } catch (err) {
    console.warn('[mediaStorageWatchdog] statfsSync error:', err.message);
  }

  return {
    totalBytes: 0,
    usedBytes: 0,
    freeBytes: 0,
    percentFree: '100.0',
    percentUsed: '0.0',
    freeFormatted: '0 B',
    totalFormatted: '0 B'
  };
}

/**
 * Gathers complete media host metrics directly from the local SQLite database.
 */
function getMediaHostStats(config = {}) {
  const disk = readHostDiskSpace();
  const dbPath = resolveMediaDbPath(config);

  const result = {
    available: false,
    dbPath,
    dbSizeBytes: 0,
    dbSizeFormatted: '0 B',
    vps: disk,
    r2: {
      configured: true,
      bucketName: 'mediahost-community',
      maxBytes: R2_MAX_FREE_BYTES,
      usedBytes: 0,
      fileCount: 0,
      percentUsed: '0.0',
      usedFormatted: '0 B',
      maxFormatted: formatBytes(R2_MAX_FREE_BYTES)
    },
    stats: {
      totalFiles: 0,
      totalBytes: 0,
      totalBytesFormatted: '0 B',
      userCount: 0,
      bannedCount: 0,
      activeInvites: 0
    }
  };

  if (!fs.existsSync(dbPath)) {
    return result;
  }

  try {
    const stats = fs.statSync(dbPath);
    result.dbSizeBytes = stats.size;
    result.dbSizeFormatted = formatBytes(stats.size);

    const db = new Database(dbPath, { readOnly: true });

    try {
      // 1. Media storage queries
      const totalMedia = db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as total_bytes FROM media').get() || {};
      const r2Stats = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(file_size), 0) as r2_bytes FROM media WHERE storage_tier = 'r2'").get() || {};

      // 2. User & invite queries
      const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get() || {};
      const bannedUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE role = 'banned'").get() || {};

      let activeInvitesCount = 0;
      try {
        const inviteColumns = (db.prepare('PRAGMA table_info(invites)').all() || []).map(c => c.name);
        if (inviteColumns.includes('expires_at') && inviteColumns.includes('revoked_at')) {
          const res = db.prepare("SELECT COUNT(*) as count FROM invites WHERE used_at IS NULL AND (expires_at IS NULL OR expires_at > CURRENT_TIMESTAMP) AND revoked_at IS NULL").get();
          activeInvitesCount = res?.count || 0;
        } else {
          const res = db.prepare("SELECT COUNT(*) as count FROM invites WHERE used_at IS NULL").get();
          activeInvitesCount = res?.count || 0;
        }
      } catch {}

      const r2Used = r2Stats.r2_bytes || 0;
      const r2Percent = R2_MAX_FREE_BYTES > 0 ? ((r2Used / R2_MAX_FREE_BYTES) * 100).toFixed(1) : '0.0';

      result.available = true;
      result.r2 = {
        configured: true,
        bucketName: 'mediahost-community',
        maxBytes: R2_MAX_FREE_BYTES,
        usedBytes: r2Used,
        fileCount: r2Stats.count || 0,
        percentUsed: r2Percent,
        usedFormatted: formatBytes(r2Used),
        maxFormatted: formatBytes(R2_MAX_FREE_BYTES)
      };

      result.stats = {
        totalFiles: totalMedia.count || 0,
        totalBytes: totalMedia.total_bytes || 0,
        totalBytesFormatted: formatBytes(totalMedia.total_bytes || 0),
        userCount: totalUsers.count || 0,
        bannedCount: bannedUsers.count || 0,
        activeInvites: activeInvitesCount
      };
    } finally {
      if (typeof db.close === 'function') {
        db.close();
      }
    }
  } catch (err) {
    console.warn('[mediaStorageWatchdog] Failed to query media.db:', err.message);
  }

  return result;
}

/**
 * Checks storage thresholds and sends a DM to the admin if thresholds are breached.
 */
async function checkAndAlertStorage(client, config = {}, force = false) {
  if (!client) return false;

  const now = Date.now();
  if (!force && (now - lastAlertTime < ALERT_COOLDOWN_MS)) {
    return false; // Respect 1-hour alert cooldown
  }

  const metrics = getMediaHostStats(config);
  const r2Used = metrics.r2.usedBytes || 0;
  const vpsPercentFree = parseFloat(metrics.vps.percentFree) || 100;

  const isR2Critical = r2Used >= R2_ALERT_THRESHOLD_BYTES;
  const isVpsCritical = vpsPercentFree < 10.0;

  if (!isR2Critical && !isVpsCritical && !force) {
    return false; // Storage is healthy, no alert needed
  }

  const adminUserId = config.ADMIN_DISCORD_USER_ID || '735152588801966132';

  try {
    const adminUser = await client.users.fetch(adminUserId);
    if (!adminUser) {
      console.warn(`[mediaStorageWatchdog] Could not fetch admin user ${adminUserId}`);
      return false;
    }

    const r2Gauge = createGaugeBar(parseFloat(metrics.r2.percentUsed) || 0, 10);
    const vpsGauge = createGaugeBar(parseFloat(metrics.vps.percentUsed) || 0, 10);

    const embed = new EmbedBuilder()
      .setTitle('⚠️ Aşık Vestel Medya Depolama Uyarısı')
      .setColor(isR2Critical || isVpsCritical ? BOT_COLORS.DANGER : BOT_COLORS.AMBER)
      .setDescription(
        `Medya sunucusu depolama eşikleri kritik seviyeye ulaştı!\n` +
        `Sunucu: \`media.asikvestel.org\` (Host: \`62.83.32.164\`)`
      )
      .addFields(
        {
          name: '☁️ Cloudflare R2 Depolama',
          value: 
            `**Kullanım:** \`${metrics.r2.usedFormatted}\` / \`${metrics.r2.maxFormatted}\` (**%${metrics.r2.percentUsed}**)\n` +
            `\`${r2Gauge}\`\n` +
            `• **Dosya Sayısı:** \`${metrics.r2.fileCount} dosya\``,
          inline: false
        },
        {
          name: '💽 VPS Disk Alanı',
          value: 
            `**Kullanım:** \`%${metrics.vps.percentUsed}\` (Boş: \`${metrics.vps.freeFormatted}\`)\n` +
            `\`${vpsGauge}\`\n` +
            `• **Toplam Kapasite:** \`${metrics.vps.totalFormatted}\``,
          inline: false
        },
        {
          name: '🚨 Durum ve Önerilen Aksiyon',
          value: isR2Critical
            ? 'Cloudflare R2 10 GB ücretsiz kotasının %85 sınırına ulaşıldı. Eski dosyaların VPS NVMe diskine aktarılması veya depolama temizliği yapılması önerilir.'
            : 'VPS disk boş alanı %10 altına düştü. Lütfen host üzerindeki disk kullanımını inceleyin.',
          inline: false
        }
      )
      .setFooter({ text: 'Aşık Vestel • Otomatik Medya Depolama Gözlemcisi' })
      .setTimestamp();

    await adminUser.send({
      content: `🚨 **Depolama Uyarısı:** <@${adminUserId}>`,
      embeds: [embed]
    });

    lastAlertTime = now;
    console.log(`[mediaStorageWatchdog] Sent storage alert DM to admin (${adminUserId})`);
    return true;
  } catch (err) {
    console.error('[mediaStorageWatchdog] Failed to send DM to admin:', err.message);
    return false;
  }
}

/**
 * Initializes the periodic storage watchdog in the Discord bot process.
 */
function initMediaStorageWatchdog(client, config = {}) {
  stopMediaStorageWatchdog();

  // Initial check 15 seconds after startup
  startupTimeout = setTimeout(() => {
    checkAndAlertStorage(client, config).catch(err => {
      console.warn('[mediaStorageWatchdog] Initial check error:', err.message);
    });
  }, 15_000);
  if (typeof startupTimeout.unref === 'function') {
    startupTimeout.unref();
  }

  // Periodic check every 1 hour (3600000 ms)
  const CHECK_INTERVAL_MS = 60 * 60 * 1000;
  watchdogInterval = setInterval(() => {
    checkAndAlertStorage(client, config).catch(err => {
      console.warn('[mediaStorageWatchdog] Periodic check error:', err.message);
    });
  }, CHECK_INTERVAL_MS);
  if (typeof watchdogInterval.unref === 'function') {
    watchdogInterval.unref();
  }

  console.log('[mediaStorageWatchdog] Storage watchdog initialized (1-hour interval, local VPS monitoring).');
}

/**
 * Stops the periodic watchdog timer.
 */
function stopMediaStorageWatchdog() {
  if (startupTimeout) {
    clearTimeout(startupTimeout);
    startupTimeout = null;
  }
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
}

module.exports = {
  formatBytes,
  readHostDiskSpace,
  resolveMediaDbPath,
  getMediaHostStats,
  checkAndAlertStorage,
  initMediaStorageWatchdog,
  stopMediaStorageWatchdog
};
