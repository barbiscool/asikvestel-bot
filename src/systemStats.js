const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const { promisify } = require('util');
const { getMediaHostStats } = require('./mediaStorageWatchdog');

const execFileAsync = promisify(execFile);

// Async on purpose: these commands take seconds, and a sync call would freeze the whole bot meanwhile.
async function run(cmd, args, timeout = 2500) {
  const { stdout } = await execFileAsync(cmd, args, { timeout, encoding: 'utf8' });
  return stdout;
}

/**
 * Admin commands are for the configured admin's Discord ID only. Usernames can be
 * changed and re-registered by someone else, so they are never trusted.
 */
function isAuthorizedAdmin(user, config = {}) {
  return !!user && !!config.ADMIN_DISCORD_USER_ID && user.id === config.ADMIN_DISCORD_USER_ID;
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
async function readProcessGroups(containers, pm2) {
  try {
    return groupProcesses(await run('ps', ['-eo', 'pid=,rss=,pcpu=,cgroup=']), { containers, pm2 });
  } catch {
    return [];
  }
}

/**
 * Lists the running Docker containers with live CPU/RAM/IO from `docker stats`.
 */
async function readDockerContainers() {
  const allContainers = [];
  try {
    const [psOutput, statsOutput] = await Promise.all([
      run('docker', ['ps', '--no-trunc', '--format', '{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}']),
      run('docker', ['stats', '--no-stream', '--format', '{{.ID}}\t{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}\t{{.BlockIO}}'])
    ]);

    const psById = new Map();
    for (const line of psOutput.trim().split('\n').filter(Boolean)) {
      const [id, name, image, status, ports] = line.split('\t');
      psById.set(id.slice(0, 12), { fullId: id, name, image, status, ports });
    }

    for (const line of statsOutput.trim().split('\n').filter(Boolean)) {
      const parts = line.split('\t');
      if (parts.length < 4) continue;
      const [idRaw, name, cpu, mem, netIO, blockIO] = parts;
      const id = idRaw.slice(0, 12);
      const ps = psById.get(id) || {};
      allContainers.push({
        id,
        fullId: ps.fullId || '',
        name,
        label: containerLabel(name, ps.image),
        image: ps.image || 'bilinmiyor',
        status: `🟢 ${ps.status || 'Up'}`,
        cpu: cpu || '0%',
        mem: mem || '0 MB',
        netIO: netIO || '0B / 0B',
        blockIO: blockIO || '0B / 0B',
        ports: ps.ports || '',
        isOnline: true
      });
    }
  } catch {}

  return { allContainers };
}

/**
 * Gathers PM2 process details via pm2 jlist:
 * - asikvestel-vault (Web Studio API on port 4000)
 * - asikvestel-media (Media Host CDN on port 4500)
 * - asikvestel-bot (Discord Bot Daemon)
 */
async function readPm2Processes() {
  const result = {
    available: false,
    processes: [],
    vaultApp: null,
    mediaApp: null,
    botApp: null,
    totalMemoryBytes: 0
  };

  try {
    const rawJson = await run('pm2', ['jlist']);

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
 * systemd state of the services the admin cares about. "Bilinmiyor" when systemctl can't be read,
 * so a failed check never shows up as green.
 */
async function readSystemServices() {
  const units = ['nginx', 'wings', 'mariadb', 'redis-server'];
  const states = units.map(() => '⚪ Bilinmiyor');
  try {
    let out;
    try {
      out = await run('systemctl', ['is-active', ...units], 1500);
    } catch (err) {
      out = err.stdout; // is-active exits non-zero when any unit is down, but still prints each state
    }
    const lines = String(out || '').trim().split('\n');
    if (lines.length === units.length) {
      lines.forEach((state, i) => { states[i] = state === 'active' ? '🟢 Aktif' : '🔴 Pasif'; });
    }
  } catch {}

  const [nginx, wings, mariadb, redis] = states;
  return { systemd: { nginx, wings, mariadb, redis } };
}

/**
 * Gathers system hardware, memory, uptime, process, Docker, PM2, and database metrics.
 */
async function getSystemStats(config = {}) {
  const cpus = os.cpus() || [];
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;
  const memUsage = process.memoryUsage();

  const meminfo = readMemInfo();
  const disk = readDiskUsage();
  const [containers, pm2, services] = await Promise.all([
    readDockerContainers(),
    readPm2Processes(),
    readSystemServices()
  ]);
  const processGroups = await readProcessGroups(containers.allContainers, pm2);
  const database = readDatabaseInfo(config);
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
    allContainers: containers.allContainers,
    processGroups,
    pm2,
    database,
    services,
    mediaHost
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
  getSystemStats
};
