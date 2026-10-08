const test = require('node:test');
const assert = require('node:assert');
const {
  isAuthorizedAdmin,
  getSystemStats,
  formatSystemStatsMessage,
  readDockerContainers,
  readPm2Processes,
  readSystemServices
} = require('../src/systemStats');

// Future system administration, VPS diagnostics, and telemetry tests should be added to this suite.

test('System Stats: admin authorization, telemetry metric collection, and Discord embed formatting', () => {
  const config = { ADMIN_DISCORD_USER_ID: '9876543210' };

  // 1. Admin authorization checks
  assert.strictEqual(isAuthorizedAdmin({ username: 'imbarb', id: '111' }, config), true);
  assert.strictEqual(isAuthorizedAdmin({ username: 'ImBarb', id: '222' }, config), true);
  assert.strictEqual(isAuthorizedAdmin({ username: 'IMBARB', id: '333' }, config), true);
  assert.strictEqual(isAuthorizedAdmin({ username: 'random_name', id: '735152588801966132' }, { ADMIN_DISCORD_USER_ID: '735152588801966132' }), true);
  assert.strictEqual(isAuthorizedAdmin({ username: 'babanız', id: '735152588801966132' }, { ADMIN_DISCORD_USER_ID: '735152588801966132' }), true);
  assert.strictEqual(isAuthorizedAdmin({ username: 'somebody_else', id: '444' }, config), false);
  assert.strictEqual(isAuthorizedAdmin(null, config), false);
  assert.strictEqual(isAuthorizedAdmin(undefined, config), false);

  // 2. Individual telemetry collectors
  const dockerStats = readDockerContainers();
  assert.ok(dockerStats.nighty !== undefined);
  assert.ok(dockerStats.vaultwarden !== undefined);
  assert.ok(dockerStats.mcRouter !== undefined);
  assert.ok(dockerStats.minecraft !== undefined);
  assert.ok(Array.isArray(dockerStats.allContainers));

  const pm2Stats = readPm2Processes();
  assert.ok(typeof pm2Stats.available === 'boolean');
  assert.ok(Array.isArray(pm2Stats.processes));
  assert.ok(typeof pm2Stats.totalMemoryBytes === 'number');

  const svcStats = readSystemServices();
  assert.ok(Array.isArray(svcStats.domains));
  assert.strictEqual(svcStats.domains.length, 5);
  assert.ok(svcStats.systemd.nginx !== undefined);
  assert.ok(svcStats.systemd.wings !== undefined);

  // 3. Full telemetry collection aggregation
  const stats = getSystemStats();
  assert.ok(stats.cpu.cores >= 1);
  assert.ok(typeof stats.cpu.model === 'string');
  assert.strictEqual(stats.cpu.loadAvg.length, 3);
  assert.ok(stats.memory.totalBytes > 0);
  assert.ok(stats.memory.freeBytes >= 0);
  assert.ok(stats.memory.usedBytes > 0);
  assert.ok(stats.memory.usedPercent >= 0 && stats.memory.usedPercent <= 100);
  assert.ok(stats.memory.processRssBytes > 0);
  assert.ok(stats.memory.processHeapUsedBytes > 0);
  assert.ok(stats.uptime.systemUptimeSeconds >= 0);
  assert.ok(stats.uptime.processUptimeSeconds >= 0);
  assert.ok(typeof stats.os.platform === 'string');
  assert.ok(typeof stats.os.nodeVersion === 'string');
  assert.ok(stats.vaultwarden !== undefined);
  assert.ok(stats.mcRouter !== undefined);
  assert.ok(stats.pm2 !== undefined);
  assert.ok(stats.services !== undefined);

  // 4. Discord embed formatting
  const payload = formatSystemStatsMessage(stats);
  assert.ok(payload.embeds && payload.embeds.length === 1);
  const embed = payload.embeds[0];
  assert.strictEqual(embed.title, '🖥️ VPS Sistem & Bot Durumu');
  assert.ok(embed.fields.length >= 4);

  const fieldTitles = embed.fields.map(f => f.name);
  assert.ok(fieldTitles.some(t => t.includes('CPU')));
  assert.ok(fieldTitles.some(t => t.includes('RAM')));
  assert.ok(fieldTitles.some(t => t.includes('Uptime')));
  assert.ok(fieldTitles.some(t => t.includes('Bot / Node')));
});

test('System Stats: multi-page telemetry (vps, web, nighty, minecraft) and ActionRow buttons', () => {
  const { createSystemPageEmbed, createSystemActionRow, createGaugeBar } = require('../src/botEmbeds');

  // 1. Gauge bar generation
  assert.strictEqual(createGaugeBar(0), '▱▱▱▱▱▱▱▱▱▱');
  assert.strictEqual(createGaugeBar(50), '▰▰▰▰▰▱▱▱▱▱');
  assert.strictEqual(createGaugeBar(100), '▰▰▰▰▰▰▰▰▰▰');

  // 2. Enhanced telemetry payload check
  const stats = getSystemStats();
  assert.ok(stats.disk !== undefined);
  assert.ok(stats.nighty !== undefined);
  assert.ok(stats.vaultwarden !== undefined);
  assert.ok(stats.mcRouter !== undefined);
  assert.ok(stats.minecraft !== undefined);
  assert.ok(stats.database !== undefined);
  assert.ok(stats.pm2 !== undefined);
  assert.ok(stats.services !== undefined);

  const mockDetailedStats = {
    cpu: { model: 'AMD EPYC-Genoa', cores: 8, loadAvg: [0.15, 0.25, 0.35] },
    memory: {
      totalBytes: 16 * 1024 * 1024 * 1024,
      freeBytes: 9 * 1024 * 1024 * 1024,
      availableBytes: 14 * 1024 * 1024 * 1024,
      usedBytes: 2 * 1024 * 1024 * 1024,
      usedPercent: 12,
      processRssBytes: 120 * 1024 * 1024,
      processHeapUsedBytes: 60 * 1024 * 1024,
      processHeapTotalBytes: 90 * 1024 * 1024,
      swapTotalBytes: 2 * 1024 * 1024 * 1024,
      swapUsedBytes: 0,
      swapFreeBytes: 2 * 1024 * 1024 * 1024
    },
    disk: {
      total: 500 * 1024 * 1024 * 1024,
      used: 12 * 1024 * 1024 * 1024,
      free: 475 * 1024 * 1024 * 1024,
      usedPercent: 3
    },
    uptime: { systemUptimeSeconds: 120000, processUptimeSeconds: 45000 },
    os: { platform: 'linux', release: '6.12.107', arch: 'x64', nodeVersion: 'v20.20.2' },
    nighty: {
      id: 'f6876914491d',
      name: 'nighty',
      image: 'nighty-linux-headless:latest',
      status: '🟢 Çalışıyor (Healthy)',
      health: 'Sağlıklı',
      cpu: '4.5%',
      mem: '538 MB / 15.6 GB',
      netIO: '37 MB / 2.9 MB',
      blockIO: '0B / 330 MB',
      isOnline: true
    },
    vaultwarden: {
      id: 'a89c2014e712',
      name: 'vaultwarden',
      image: 'vaultwarden/server:latest',
      status: '🟢 Çalışıyor (Healthy)',
      health: 'Sağlıklı',
      cpu: '0.2%',
      mem: '42 MB / 15.6 GB',
      netIO: '12 MB / 18 MB',
      blockIO: '0B / 5 MB',
      isOnline: true
    },
    mcRouter: {
      id: 'c124819ad581',
      name: 'mc-router',
      image: 'itzg/mc-router:latest',
      status: '🟢 Up 4 days',
      cpu: '0.1%',
      mem: '18 MB / 15.6 GB',
      port: '0.0.0.0:25565 (TCP/UDP)',
      isOnline: true
    },
    minecraft: {
      id: 'bb7b95a59f68',
      containerName: 'a4bb6cc7-c9df-4e91-b928-bc89db472766',
      image: 'ghcr.io/ptero-eggs/yolks:java_25',
      status: '🟢 Çevrimiçi (Aktif)',
      type: 'Fabric (Java 25)',
      ports: '62.83.32.164:25565 / 25566 (TCP/UDP)',
      cpu: '18.6%',
      mem: '4.05 GB / 6.30 GB',
      netIO: '120 MB / 450 MB',
      isOnline: true
    },
    pm2: {
      available: true,
      processes: [
        { name: 'asikvestel-vault', pmId: 0, status: 'online', memoryBytes: 110 * 1024 * 1024, cpuPercent: 0.5 },
        { name: 'asikvestel-media', pmId: 1, status: 'online', memoryBytes: 48 * 1024 * 1024, cpuPercent: 0.1 },
        { name: 'asikvestel-bot', pmId: 2, status: 'online', memoryBytes: 85 * 1024 * 1024, cpuPercent: 0.3 }
      ],
      vaultApp: { name: 'asikvestel-vault', status: 'online', memoryBytes: 110 * 1024 * 1024, cpuPercent: 0.5 },
      mediaApp: { name: 'asikvestel-media', status: 'online', memoryBytes: 48 * 1024 * 1024, cpuPercent: 0.1 },
      botApp: { name: 'asikvestel-bot', status: 'online', memoryBytes: 85 * 1024 * 1024, cpuPercent: 0.3 },
      totalMemoryBytes: 243 * 1024 * 1024
    },
    services: {
      domains: [
        { domain: 'asikvestel.org', service: 'Web Studio & API', target: 'http://127.0.0.1:4000', ssl: true },
        { domain: 'media.asikvestel.org', service: 'CDN Medya Host', target: 'http://127.0.0.1:4500', ssl: true },
        { domain: 'nighty.asikvestel.org', service: 'Nighty Selfbot Web UI', target: 'http://127.0.0.1:8088', ssl: true },
        { domain: 'panel.asikvestel.org', service: 'Pterodactyl Game Panel', target: 'http://127.0.0.1:8080', ssl: true },
        { domain: 'vault.asikvestel.org', service: 'Vaultwarden Parola Kasası', target: 'http://127.0.0.1:8090', ssl: true }
      ],
      systemd: {
        nginx: '🟢 Aktif',
        wings: '🟢 Aktif',
        mariadb: '🟢 Aktif',
        redis: '🟢 Aktif'
      }
    },
    mediaHost: {
      dbPath: '/var/www/media-host/data/media.db',
      dbExists: true,
      dbSizeBytes: 16384,
      dbSizeFormatted: '16.00 KB',
      r2: {
        usedBytes: 1024 * 1024 * 1024 * 2.5,
        usedFormatted: '2.50 GB',
        maxBytes: 10 * 1024 * 1024 * 1024,
        maxFormatted: '10.00 GB',
        percentUsed: '25.0',
        fileCount: 420,
        bucketName: 'mediahost-community'
      },
      vps: {
        usedBytes: 1024 * 1024 * 1024 * 20,
        usedFormatted: '20.00 GB',
        freeBytes: 1024 * 1024 * 1024 * 80,
        freeFormatted: '80.00 GB',
        totalBytes: 1024 * 1024 * 1024 * 100,
        totalFormatted: '100.00 GB',
        percentUsed: '20.0'
      },
      stats: {
        totalFiles: 420,
        totalBytesFormatted: '2.50 GB',
        userCount: 8,
        activeInvites: 2,
        bannedCount: 0
      }
    },
    database: {
      exists: true,
      path: '/var/lib/asikvestel/clips.db',
      mainSizeBytes: 28 * 1024 * 1024,
      walSizeBytes: 5 * 1024 * 1024,
      shmSizeBytes: 32 * 1024
    }
  };

  const fb = (b) => `${(b / (1024 * 1024)).toFixed(0)} MB`;
  const fd = (s) => `${Math.floor(s / 60)}d`;

  // 3. Render Page: VPS & OS
  const vpsEmbed = createSystemPageEmbed({ page: 'vps', stats: mockDetailedStats, formatBytes: fb, formatDuration: fd });
  assert.ok(vpsEmbed.data.title.includes('VPS Sistem'));
  assert.ok(vpsEmbed.data.fields.some(f => f.name.includes('İşlemci')));
  assert.ok(vpsEmbed.data.fields.some(f => f.name.includes('RAM')));
  assert.ok(vpsEmbed.data.fields.some(f => f.name.includes('NVMe SSD')));
  assert.ok(vpsEmbed.data.fields.some(f => f.name.includes('Domain') || f.name.includes('Nginx') || f.name.includes('Alan')));

  // 4. Render Page: Media Storage
  const mediaEmbed = createSystemPageEmbed({ page: 'media', stats: mockDetailedStats, formatBytes: fb, formatDuration: fd });
  assert.ok(mediaEmbed.data.title.includes('Medya Sunucusu Depolama'));
  assert.ok(mediaEmbed.data.fields.some(f => f.name.includes('Cloudflare R2')));
  assert.ok(mediaEmbed.data.fields.some(f => f.name.includes('NVMe Disk')));
  assert.ok(mediaEmbed.data.fields.some(f => f.name.includes('Kullanıcılar')));
  assert.ok(mediaEmbed.data.footer.text.includes('Sayfa 2/5'));

  // 5. Render Page: Web & Bot
  const webEmbed = createSystemPageEmbed({ page: 'web', stats: mockDetailedStats, formatBytes: fb, formatDuration: fd });
  assert.ok(webEmbed.data.title.includes('Web Sitesi'));
  assert.ok(webEmbed.data.fields.some(f => f.name.includes('Node.js & PM2')));
  assert.ok(webEmbed.data.fields.some(f => f.name.includes('SQLite')));
  assert.ok(webEmbed.data.fields.some(f => f.value.includes('asikvestel-vault')));
  assert.ok(webEmbed.data.fields.some(f => f.value.includes('asikvestel-media')));
  assert.ok(webEmbed.data.footer.text.includes('Sayfa 3/5'));

  // 6. Render Page: Nighty
  const nightyEmbed = createSystemPageEmbed({ page: 'nighty', stats: mockDetailedStats, formatBytes: fb, formatDuration: fd });
  assert.ok(nightyEmbed.data.title.includes('Nighty'));
  assert.ok(nightyEmbed.data.fields.some(f => f.name.includes('Konteyner Durumu')));
  assert.ok(nightyEmbed.data.fields.some(f => f.value.includes('538 MB')));
  assert.ok(nightyEmbed.data.fields.some(f => f.name.includes('Vaultwarden')));
  assert.ok(nightyEmbed.data.fields.some(f => f.name.includes('mc-router')));
  assert.ok(nightyEmbed.data.footer.text.includes('Sayfa 4/5'));

  // 7. Render Page: Minecraft
  const mcEmbed = createSystemPageEmbed({ page: 'mc', stats: mockDetailedStats, formatBytes: fb, formatDuration: fd });
  assert.ok(mcEmbed.data.title.includes('Minecraft'));
  assert.ok(mcEmbed.data.fields.some(f => f.name.includes('Sunucu Durumu')));
  assert.ok(mcEmbed.data.fields.some(f => f.value.includes('25565')));
  assert.ok(mcEmbed.data.fields.some(f => f.name.includes('Wings')));
  assert.ok(mcEmbed.data.footer.text.includes('Sayfa 5/5'));

  // 8. ActionRow validation (2-tier layout)
  const rows = createSystemActionRow('mc', false);
  assert.ok(Array.isArray(rows));
  assert.strictEqual(rows.length, 2);
  const navRow = rows[0];
  assert.strictEqual(navRow.components.length, 5);
  const customIds = navRow.components.map(c => c.data.custom_id);
  assert.deepStrictEqual(customIds, ['sys_page_vps', 'sys_page_media', 'sys_page_web', 'sys_page_nighty', 'sys_page_mc']);

  // mc button should have Primary style (1), others Secondary (2)
  const mcBtn = navRow.components.find(c => c.data.custom_id === 'sys_page_mc');
  const vpsBtn = navRow.components.find(c => c.data.custom_id === 'sys_page_vps');
  assert.strictEqual(mcBtn.data.style, 1);
  assert.strictEqual(vpsBtn.data.style, 2);

  // Row 2 actions
  const actionRow = rows[1];
  assert.ok(actionRow.components.some(c => c.data.custom_id === 'sys_page_refresh'));
  assert.ok(actionRow.components.some(c => c.data.label === '🌐 Web Sitesi'));
  assert.ok(actionRow.components.some(c => c.data.label === '☁️ Medya Host'));
});
