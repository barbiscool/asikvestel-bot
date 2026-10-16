const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { getMediaHostStats } = require('./mediaStorageWatchdog');

/**
 * Admin commands are for the configured admin's Discord ID only. Usernames can be
 * changed and re-registered by someone else, so they are never trusted.
 */
function isAuthorizedAdmin(user, config = {}) {
  return !!user && user.id === (config.ADMIN_DISCORD_USER_ID || '735152588801966132');
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

const PM2_LABELS = {
  'asikvestel-vault': 'Web Sitesi (asikvestel-vault)',
  'asikvestel-media': 'CDN Medya Host (asikvestel-media)',
  'asikvestel-bot': 'Discord Botu (asikvestel-bot)'
};

const UNIT_LABELS = {
  nginx: 'Nginx (Ters Proxy)',
  wings: 'Pterodactyl Wings',
  pteroq: 'Pterodactyl Kuyruk İşçisi',
  mariadb: 'MariaDB (Panel Veritabanı)',
  'redis-server': 'Redis (Önbellek)',
  'php8.3-fpm': 'PHP-FPM (Panel)',
  docker: 'Docker Motoru',
  containerd: 'containerd',
  'pm2-root': 'PM2 Yöneticisi',
  cron: 'Cron Zamanlayıcı',
  ssh: 'SSH Sunucusu',
  'qemu-guest-agent': 'QEMU Guest Agent',
  'systemd-journald': 'Sistem Günlüğü (journald)',
  'systemd-logind': 'Oturum Yöneticisi (logind)',
  'systemd-timesyncd': 'Saat Eşitleme',
  'systemd-udevd': 'Aygıt Yöneticisi (udev)'
};

/**
 * Human-readable Turkish names for the Docker containers on the VPS.
 */
function containerLabel(name = '', image = '') {
  const n = name.toLowerCase();
  const img = (image || '').toLowerCase();
  if (n.includes('nighty') || img.includes('nighty')) return 'Nighty Selfbot';
  if (n.includes('vaultwarden') || img.includes('vaultwarden')) return 'Vaultwarden Parola Kasası';
  if (n.includes('mc-router') || img.includes('mc-router')) return 'mc-router Minecraft Yönlendirici';
  if (n.includes('wg-easy') || img.includes('wg-easy')) return 'WireGuard VPN (wg-easy)';
  if (img.includes('ptero') || img.includes('yolks') || /^[0-9a-f-]{36}$/.test(n)) return 'Minecraft Sunucusu (Pterodactyl)';
  return name || 'Bilinmeyen Konteyner';
}

/**
 * Groups every process on the host by what owns it, using the cgroup path from `ps`:
 * a Docker container, a PM2 app, a systemd unit or a login session.
 * `psText` lines look like `pid rss_kb pcpu cgroup`. Returns groups sorted by RAM.
 */
function groupProcesses(psText, { containers = [], pm2 = {} } = {}) {
  const byFullId = new Map(containers.filter(c => c.fullId).map(c => [c.fullId, c]));
  const pm2ByPid = new Map((pm2.processes || []).filter(p => p.pid).map(p => [p.pid, p]));
  const groups = new Map();

  for (const line of String(psText).split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+([\d.]+)\s+(\S+)$/);
    if (!m) continue;
    const pid = Number(m[1]);
    const rssBytes = Number(m[2]) * 1024;
    const cpu = parseFloat(m[3]) || 0;
    const leaf = m[4].split('/').pop();
    let key, label, kind;

    const docker = leaf.match(/^docker-([0-9a-f]{64})\.scope$/);
    if (pm2ByPid.has(pid)) {
      const name = pm2ByPid.get(pid).name;
      key = `pm2:${name}`; label = PM2_LABELS[name] || name; kind = 'pm2';
    } else if (docker) {
      const c = byFullId.get(docker[1]);
      key = `docker:${docker[1]}`; label = c ? c.label : `Konteyner ${docker[1].slice(0, 12)}`; kind = 'docker';
    } else if (leaf.endsWith('.service')) {
      const unit = leaf.slice(0, -'.service'.length);
      key = `unit:${unit}`; label = UNIT_LABELS[unit] || unit; kind = 'systemd';
    } else if (/^session-\d+\.scope$/.test(leaf)) {
      key = 'sessions'; label = 'SSH Oturumları'; kind = 'session';
    } else {
      continue; // kernel threads have no cgroup
    }

    const g = groups.get(key) || { key, label, kind, rssBytes: 0, cpu: 0, procs: 0 };
    g.rssBytes += rssBytes;
    g.cpu += cpu;
    g.procs += 1;
    groups.set(key, g);
  }

  return [...groups.values()].sort((a, b) => b.rssBytes - a.rssBytes);
}

/**
 * Lists every resource-using task on the host. CPU is `ps` pcpu (average over the
 * process lifetime, per core), unlike the live `docker stats` figures.
 */
function readProcessGroups(containers, pm2) {
  try {
    const out = execSync('ps -eo pid=,rss=,pcpu=,cgroup=', {
      timeout: 2500,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });
    return groupProcesses(out, { containers, pm2 });
  } catch {
    return [];
  }
}

/**
 * Gathers Docker container statistics dynamically for all running services:
 * - Nighty Headless Selfbot
 * - Vaultwarden Password Manager
 * - mc-router Minecraft Traffic Router
 * - Pterodactyl Minecraft Fabric/Java Server
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
    vaultwarden: {
      id: '-',
      name: 'vaultwarden',
      image: 'vaultwarden/server:latest',
      status: 'Çevrimdışı / Tespit Edilemedi',
      health: 'Bilinmiyor',
      cpu: '0.0%',
      mem: '0 MB / 0 MB',
      netIO: '0B / 0B',
      blockIO: '0B / 0B',
      port: '127.0.0.1:8090 -> vault.asikvestel.org',
      isOnline: false
    },
    mcRouter: {
      id: '-',
      name: 'mc-router',
      image: 'itzg/mc-router:latest',
      status: 'Çevrimdışı / Tespit Edilemedi',
      cpu: '0.0%',
      mem: '0 MB / 0 MB',
      port: '0.0.0.0:25565 (TCP/UDP)',
      isOnline: false
    },
    minecraft: {
      id: '-',
      containerName: 'pterodactyl-mc',
      image: 'ghcr.io/ptero-eggs/yolks:java_25',
      status: 'Çevrimdışı / Hazırlanıyor',
      type: 'Fabric (Java 25)',
      ports: '62.83.32.164:25565 / 25566 (TCP/UDP)',
      cpu: '0.0%',
      mem: '0 MB / 0 MB',
      netIO: '0B / 0B',
      blockIO: '0B / 0B',
      isOnline: false
    },
    allContainers: []
  };

  try {
    // 1. Query running containers via docker ps
    const psOutput = execSync('docker ps --no-trunc --format "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}"', {
      timeout: 2500,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });

    const psMap = new Map();
    const psLines = psOutput.trim().split('\n').filter(Boolean);
    for (const line of psLines) {
      const [id, names, image, status, ports] = line.split('\t');
      const info = { id: id.slice(0, 12), fullId: id, name: names, image, status, ports };
      psMap.set(info.id, info);
      psMap.set(names, info);
    }

    // 2. Query resource stats via docker stats
    const statsOutput = execSync('docker stats --no-stream --format "{{.ID}}\t{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}"', {
      timeout: 2500,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });

    const lines = statsOutput.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      const parts = line.split('\t');
      if (parts.length < 4) continue;
      const [idRaw, name, cpuPerc, memUsageStr, netIO, blockIO] = parts;
      const shortId = idRaw.slice(0, 12);
      const psInfo = psMap.get(shortId) || psMap.get(name) || {};
      const statusText = psInfo.status || '🟢 Up';

      const containerObj = {
        id: shortId,
        name,
        image: psInfo.image || 'bilinmiyor',
        status: `🟢 ${statusText}`,
        cpu: cpuPerc || '0%',
        mem: memUsageStr || '0 MB',
        netIO: netIO || '0B / 0B',
        blockIO: blockIO || '0B / 0B',
        ports: psInfo.ports || '',
        fullId: psInfo.fullId || '',
        label: containerLabel(name, psInfo.image),
        isOnline: true
      };

      result.allContainers.push(containerObj);

      const nameLower = (name || '').toLowerCase();
      const imageLower = (psInfo.image || '').toLowerCase();

      if (nameLower.includes('nighty') || imageLower.includes('nighty')) {
        result.nighty = {
          ...containerObj,
          image: psInfo.image || 'nighty-linux-headless:latest',
          health: statusText.includes('healthy') ? 'Sağlıklı' : 'Aktif',
          port: '127.0.0.1:8088 -> nighty.asikvestel.org'
        };
      } else if (nameLower.includes('vaultwarden') || imageLower.includes('vaultwarden')) {
        result.vaultwarden = {
          ...containerObj,
          image: psInfo.image || 'vaultwarden/server:latest',
          health: statusText.includes('healthy') ? 'Sağlıklı' : 'Aktif',
          port: '127.0.0.1:8090 -> vault.asikvestel.org'
        };
      } else if (nameLower.includes('mc-router') || imageLower.includes('mc-router')) {
        result.mcRouter = {
          ...containerObj,
          image: psInfo.image || 'itzg/mc-router:latest',
          port: '0.0.0.0:25565 (TCP/UDP)'
        };
      } else if (imageLower.includes('ptero') || imageLower.includes('yolks') || /^[0-9a-f-]{36}$/.test(nameLower)) {
        result.minecraft = {
          ...containerObj,
          containerName: name,
          type: imageLower.includes('25') ? 'Fabric (Java 25)' : 'Fabric (Java 21)',
          ports: '62.83.32.164:25565 / 25566 (TCP/UDP)'
        };
      }
    }
  } catch {}

  return result;
}

/**
 * Gathers PM2 process details via pm2 jlist:
 * - asikvestel-vault (Web Studio API on port 4000)
 * - asikvestel-media (Media Host CDN on port 4500)
 * - asikvestel-bot (Discord Bot Daemon)
 */
function readPm2Processes() {
  const result = {
    available: false,
    processes: [],
    vaultApp: null,
    mediaApp: null,
    botApp: null,
    totalMemoryBytes: 0
  };

  try {
    const rawJson = execSync('pm2 jlist', {
      timeout: 2500,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    });

    const parsed = JSON.parse(rawJson);
    if (Array.isArray(parsed)) {
      result.available = true;
      for (const proc of parsed) {
        const memBytes = proc.monit?.memory || 0;
        result.totalMemoryBytes += memBytes;

        const info = {
          name: proc.name,
          pmId: proc.pm_id,
          pid: proc.pid,
          status: proc.pm2_env?.status || 'online',
          memoryBytes: memBytes,
          cpuPercent: proc.monit?.cpu || 0,
          uptimeMs: proc.pm2_env?.pm_uptime ? (Date.now() - proc.pm2_env.pm_uptime) : 0,
          restarts: proc.pm2_env?.restart_time || 0,
          version: proc.pm2_env?.version || '1.0.0',
          mode: proc.pm2_env?.exec_mode || 'fork'
        };

        result.processes.push(info);
        if (proc.name === 'asikvestel-vault') result.vaultApp = info;
        else if (proc.name === 'asikvestel-media') result.mediaApp = info;
        else if (proc.name === 'asikvestel-bot') result.botApp = info;
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
 * Returns static & detected systemd services and 5 proxied domains.
 */
function readSystemServices() {
  const domains = [
    { domain: 'asikvestel.org', service: 'Web Studio & API', target: 'http://127.0.0.1:4000', ssl: true },
    { domain: 'media.asikvestel.org', service: 'CDN Medya Host', target: 'http://127.0.0.1:4500', ssl: true },
    { domain: 'nighty.asikvestel.org', service: 'Nighty Selfbot Web UI', target: 'http://127.0.0.1:8088', ssl: true },
    { domain: 'panel.asikvestel.org', service: 'Pterodactyl Game Panel', target: 'http://127.0.0.1:8080', ssl: true },
    { domain: 'vault.asikvestel.org', service: 'Vaultwarden Parola Kasası', target: 'http://127.0.0.1:8090', ssl: true }
  ];

  let nginxStatus = '🟢 Aktif';
  let wingsStatus = '🟢 Aktif';
  let mariadbStatus = '🟢 Aktif';
  let redisStatus = '🟢 Aktif';

  try {
    const s = execSync('systemctl is-active nginx wings mariadb redis-server 2>/dev/null || true', {
      timeout: 1500,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'ignore']
    }).trim().split('\n');
    if (s[0] && s[0] !== 'active') nginxStatus = '🔴 Pasif';
    if (s[1] && s[1] !== 'active') wingsStatus = '🔴 Pasif';
    if (s[2] && s[2] !== 'active') mariadbStatus = '🔴 Pasif';
    if (s[3] && s[3] !== 'active') redisStatus = '🔴 Pasif';
  } catch {}

  return {
    domains,
    systemd: {
      nginx: nginxStatus,
      wings: wingsStatus,
      mariadb: mariadbStatus,
      redis: redisStatus
    }
  };
}

/**
 * Gathers system hardware, memory, uptime, process, Docker, PM2, and database metrics.
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
  const pm2 = readPm2Processes();
  const processGroups = readProcessGroups(containers.allContainers, pm2);
  const database = readDatabaseInfo(config);
  const services = readSystemServices();
  const mediaHost = getMediaHostStats(config);

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
    vaultwarden: containers.vaultwarden,
    mcRouter: containers.mcRouter,
    minecraft: containers.minecraft,
    allContainers: containers.allContainers,
    processGroups,
    pm2,
    database,
    services,
    mediaHost
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
        name: '🌐 İşletim Sistemi & Portlar',
        value: `${stats.os.platform} (${stats.os.arch}) - ${stats.os.release}\n**Nginx Proxy:** 5 Aktif Domain (80/443/8443)`,
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
  readDockerContainers,
  readPm2Processes,
  readSystemServices,
  groupProcesses,
  containerLabel,
  getSystemStats,
  formatSystemStatsMessage
};
