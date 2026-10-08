const test = require('node:test');
const assert = require('node:assert');
const { isAuthorizedAdmin, getSystemStats, formatSystemStatsMessage } = require('../src/systemStats');

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

  // 2. Telemetry collection
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

  // 3. Discord embed formatting
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
  assert.ok(stats.minecraft !== undefined);
  assert.ok(stats.database !== undefined);

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
      cpu: '4.5%',
      mem: '538 MB / 15.6 GB',
      netIO: '37 MB / 2.9 MB',
      blockIO: '0B / 330 MB',
      isOnline: true
    },
    minecraft: {
      id: 'bb7b95a59f68',
      containerName: 'a4bb6cc7-c9df-4e91-b928-bc89db472766',
      image: 'ghcr.io/pterodactyl/yolks:java_21',
      status: '🟢 Çevrimiçi (Aktif)',
      type: 'Fabric 1.21 (Java 21)',
      ports: '62.83.32.164:25565 (TCP/UDP)',
      cpu: '18.6%',
      mem: '4.05 GB / 6.30 GB',
      isOnline: true
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

  // 4. Render Page: Web & Bot
  const webEmbed = createSystemPageEmbed({ page: 'web', stats: mockDetailedStats, formatBytes: fb, formatDuration: fd });
  assert.ok(webEmbed.data.title.includes('Web Sitesi'));
  assert.ok(webEmbed.data.fields.some(f => f.name.includes('Node.js & PM2')));
  assert.ok(webEmbed.data.fields.some(f => f.name.includes('SQLite')));

  // 5. Render Page: Nighty
  const nightyEmbed = createSystemPageEmbed({ page: 'nighty', stats: mockDetailedStats, formatBytes: fb, formatDuration: fd });
  assert.ok(nightyEmbed.data.title.includes('Nighty'));
  assert.ok(nightyEmbed.data.fields.some(f => f.name.includes('Konteyner Durumu')));
  assert.ok(nightyEmbed.data.fields.some(f => f.value.includes('538 MB')));

  // 6. Render Page: Minecraft
  const mcEmbed = createSystemPageEmbed({ page: 'mc', stats: mockDetailedStats, formatBytes: fb, formatDuration: fd });
  assert.ok(mcEmbed.data.title.includes('Minecraft'));
  assert.ok(mcEmbed.data.fields.some(f => f.name.includes('Sunucu Durumu')));
  assert.ok(mcEmbed.data.fields.some(f => f.value.includes('25565')));

  // 7. ActionRow validation
  const row = createSystemActionRow('mc', false);
  assert.strictEqual(row.components.length, 5);
  const customIds = row.components.map(c => c.data.custom_id);
  assert.deepStrictEqual(customIds, ['sys_page_vps', 'sys_page_web', 'sys_page_nighty', 'sys_page_mc', 'sys_page_refresh']);

  // mc button should have Primary style (1), others Secondary (2) except refresh (Success=3)
  const mcBtn = row.components.find(c => c.data.custom_id === 'sys_page_mc');
  const vpsBtn = row.components.find(c => c.data.custom_id === 'sys_page_vps');
  assert.strictEqual(mcBtn.data.style, 1);
  assert.strictEqual(vpsBtn.data.style, 2);
});
