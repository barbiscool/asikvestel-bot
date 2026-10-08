const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

/**
 * Checks whether the invoking Discord user is authorized to run admin commands.
 * Strictly limited to Discord username 'imbarb' or matching configured admin credentials.
 */
function isAuthorizedAdmin(user, config = {}) {
  if (!user) return false;

  if (user.id === '735152588801966132' || (config.ADMIN_DISCORD_USER_ID && user.id === config.ADMIN_DISCORD_USER_ID)) {
    return true;
  }

  const username = (user.username || '').toLowerCase().trim();
  if (username === 'imbarb') {
    return true;
  }

  if (config.ADMIN_USERNAME && username === config.ADMIN_USERNAME.toLowerCase().trim()) {
    return true;
  }

  return false;
}

/**
 * Formats a duration in seconds into a human-readable string (e.g., "3d 4h 12m" or "45m 10s").
 */
function formatDuration(seconds) {
  const sec = Math.floor(seconds);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const remainSec = sec % 60;

  const parts = [];
  if (days > 0) parts.push(`${days}g`);
  if (hours > 0 || days > 0) parts.push(`${hours}s`);
  parts.push(`${minutes}d`);
  if (days === 0 && hours === 0) parts.push(`${remainSec}sn`);
  return parts.join(' ');
}

/**
 * Formats bytes to megabytes / gigabytes.
 */
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '0 MB';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1024) {
    return `${(mb / 1024).toFixed(2)} GB`;
  }
  return `${mb.toFixed(1)} MB`;
}

/**
 * Reads /proc/meminfo for Linux host MemAvailable and Swap stats.
 */
function readMemInfo() {
  try {
    const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
    const getVal = (key) => {
      const match = meminfo.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'));
      return match ? parseInt(match[1], 10) * 1024 : 0;
    };
    return {
      available: getVal('MemAvailable'),
      swapTotal: getVal('SwapTotal'),
      swapFree: getVal('SwapFree')
    };
  } catch {
    return { available: 0, swapTotal: 0, swapFree: 0 };
  }
}

/**
 * Reads root filesystem disk metrics via statfs.
 */
function readDiskUsage() {
  try {
    if (typeof fs.statfsSync === 'function') {
      const s = fs.statfsSync('/');
      const total = s.blocks * s.bsize;
      const free = s.bavail * s.bsize;
      const used = total - (s.bfree * s.bsize);
      return {
        total,
        used,
        free,
        usedPercent: Math.round(((s.blocks - s.bavail) / s.blocks) * 100)
      };
    }
  } catch {}
  return { total: 0, used: 0, free: 0, usedPercent: 0 };
}

/**
 * Gathers Docker container statistics for Nighty and Pterodactyl/Minecraft.
 */
function readDockerContainers() {
  const result = {
    nighty: {
      id: '-',
      name: 'nighty',
      image: 'nighty-linux-headless:latest',
      status: 'Çevrimdışı / Tespit Edilemedi',
      health: 'Bilinmiyor',
      cpu: '0.0%',
      mem: '0 MB / 0 MB',
      netIO: '0B / 0B',
      blockIO: '0B / 0B',
      port: '127.0.0.1:8088 -> nighty.asikvestel.org',
      isOnline: false
    },
    minecraft: {
      id: '-',
      containerName: 'a4bb6cc7-c9df-4e91-b928-bc89db472766',
      image: 'ghcr.io/pterodactyl/yolks:java_21',
      status: 'Çevrimdışı / Hazırlanıyor',
      type: 'Fabric 1.21 (Java 21)',
      ports: '62.83.32.164:25565 (TCP/UDP)',
      cpu: '0.0%',
      mem: '0 MB / 0 MB',
      netIO: '0B / 0B',
      blockIO: '0B / 0B',
      isOnline: false
    }
  };

  try {
    const statsOutput = execSync('docker stats --no-stream --format "{{.ID}}\t{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"', {
      timeout: 2500,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });

    const lines = statsOutput.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length < 4) continue;
      const [id, name, cpuPerc, memUsageStr, netIO, blockIO] = parts;

      if (name.toLowerCase().includes('nighty')) {
        result.nighty = {
          id: id.slice(0, 12),
          name: 'nighty',
          image: 'nighty-linux-headless:latest',
          status: '🟢 Çalışıyor (Healthy)',
          health: 'Sağlıklı',
          cpu: cpuPerc || '0%',
          mem: memUsageStr || '0 MB',
          netIO: netIO || '0B / 0B',
          blockIO: blockIO || '0B / 0B',
          port: '127.0.0.1:8088 -> nighty.asikvestel.org',
          isOnline: true
        };
      } else {
        result.minecraft = {
          id: id.slice(0, 12),
          containerName: name,
          image: 'ghcr.io/pterodactyl/yolks:java_21',
          status: '🟢 Çevrimiçi (Aktif)',
          type: 'Fabric 1.21 (Java 21)',
          ports: '62.83.32.164:25565 (TCP/UDP)',
          cpu: cpuPerc || '0%',
          mem: memUsageStr || '0 MB',
          netIO: netIO || '0B / 0B',
          blockIO: blockIO || '0B / 0B',
          isOnline: true
        };
      }
    }
  } catch {}

  return result;
}

/**
 * Gathers SQLite database file metrics.
 */
function readDatabaseInfo(config = {}) {
  const dbPath = config.DB_PATH || process.env.DB_PATH || '/var/lib/asikvestel/clips.db';
  const info = {
    exists: false,
    path: dbPath,
    mainSizeBytes: 0,
    walSizeBytes: 0,
    shmSizeBytes: 0
  };

  try {
    if (fs.existsSync(dbPath)) {
      info.exists = true;
      info.mainSizeBytes = fs.statSync(dbPath).size;
      if (fs.existsSync(dbPath + '-wal')) info.walSizeBytes = fs.statSync(dbPath + '-wal').size;
      if (fs.existsSync(dbPath + '-shm')) info.shmSizeBytes = fs.statSync(dbPath + '-shm').size;
    }
  } catch {}

  return info;
}

/**
 * Gathers system hardware, memory, uptime, process, Docker, and database metrics.
 */
function getSystemStats(config = {}) {
  const cpus = os.cpus() || [];
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsage = process.memoryUsage();

  const meminfo = readMemInfo();
  const disk = readDiskUsage();
  const containers = readDockerContainers();
  const database = readDatabaseInfo(config);

  const availableMem = meminfo.available > 0 ? meminfo.available : freeMem;
  const swapTotal = meminfo.swapTotal;
  const swapFree = meminfo.swapFree;
  const swapUsed = swapTotal - swapFree;

  return {
    cpu: {
      model: cpus[0]?.model || 'AMD EPYC-Genoa',
      cores: cpus.length,
      loadAvg: os.loadavg() // [1m, 5m, 15m]
    },
    memory: {
      totalBytes: totalMem,
      freeBytes: freeMem,
      availableBytes: availableMem,
      usedBytes: usedMem,
      usedPercent: Math.round((usedMem / totalMem) * 100),
      processRssBytes: memUsage.rss,
      processHeapUsedBytes: memUsage.heapUsed,
      processHeapTotalBytes: memUsage.heapTotal,
      swapTotalBytes: swapTotal,
      swapUsedBytes: swapUsed,
      swapFreeBytes: swapFree
    },
    disk,
    uptime: {
      systemUptimeSeconds: os.uptime(),
      processUptimeSeconds: process.uptime()
    },
    os: {
      platform: os.platform(),
      release: os.release(),
      arch: os.arch(),
      nodeVersion: process.version
    },
    nighty: containers.nighty,
    minecraft: containers.minecraft,
    database
  };
}

/**
 * Builds the Discord Embed response payload for the /system command.
 */
function formatSystemStatsMessage(stats) {
  const load1 = stats.cpu.loadAvg[0].toFixed(2);
  const load5 = stats.cpu.loadAvg[1].toFixed(2);
  const load15 = stats.cpu.loadAvg[2].toFixed(2);

  const ramUsed = formatBytes(stats.memory.usedBytes);
  const ramTotal = formatBytes(stats.memory.totalBytes);
  const ramFree = formatBytes(stats.memory.freeBytes);

  const botRss = formatBytes(stats.memory.processRssBytes);
  const botHeap = formatBytes(stats.memory.processHeapUsedBytes);

  const sysUptime = formatDuration(stats.uptime.systemUptimeSeconds);
  const botUptime = formatDuration(stats.uptime.processUptimeSeconds);

  // Status indicator color (green <= 75%, orange <= 90%, red > 90%)
  let embedColor = 0x22c55e; // Green
  if (stats.memory.usedPercent > 90) {
    embedColor = 0xef4444; // Red
  } else if (stats.memory.usedPercent > 75) {
    embedColor = 0xf59e0b; // Amber
  }

  const embed = {
    title: '🖥️ VPS Sistem & Bot Durumu',
    description: `Aşık Vestel VPS ana makine kaynak ve çalışma istatistikleri.`,
    color: embedColor,
    fields: [
      {
        name: '⚙️ CPU & İşlemci',
        value: `**Çekirdek:** ${stats.cpu.cores} vCPU\n**Model:** ${stats.cpu.model.split('@')[0].trim()}\n**Yük (1/5/15 dk):** \`${load1}\`, \`${load5}\`, \`${load15}\``,
        inline: true
      },
      {
        name: '🧠 RAM (Bellek)',
        value: `**Kullanım:** %${stats.memory.usedPercent} (${ramUsed} / ${ramTotal})\n**Boş:** ${ramFree}`,
        inline: true
      },
      {
        name: '🤖 Bot / Node.js Süreci',
        value: `**RSS Bellek:** ${botRss}\n**Heap:** ${botHeap}\n**Node:** ${stats.os.nodeVersion}`,
        inline: true
      },
      {
        name: '⏱️ Çalışma Süresi (Uptime)',
        value: `**VPS Uptime:** ${sysUptime}\n**Bot Uptime:** ${botUptime}`,
        inline: true
      },
      {
        name: '🌐 İşletim Sistemi',
        value: `${stats.os.platform} (${stats.os.arch}) - ${stats.os.release}`,
        inline: true
      }
    ],
    footer: {
      text: 'Aşık Vestel Vault Bot • Yalnızca @imbarb yetkilidir'
    },
    timestamp: new Date().toISOString()
  };

  return {
    embeds: [embed]
  };
}

module.exports = {
  isAuthorizedAdmin,
  formatDuration,
  formatBytes,
  getSystemStats,
  formatSystemStatsMessage
};
