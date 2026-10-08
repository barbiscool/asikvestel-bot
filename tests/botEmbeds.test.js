const test = require('node:test');
const assert = require('node:assert');
const {
  BOT_COLORS,
  CATEGORY_ICONS,
  createClipEmbed,
  createImageEmbed,
  createQuoteEmbed,
  createStatsEmbed,
  createMediaHostStatsEmbed,
  createSystemEmbed,
  createStatusAlertEmbed
} = require('../src/botEmbeds');

// Future Discord bot embed templates, styles, and interactive buttons should be added to this suite.

test('Bot Embeds: content presentation embeds (clips, media/GIFs, quotes, archive stats)', () => {
  // 1. Clip embed
  const clipPayload = createClipEmbed({
    clipData: {
      author_name: 'barb',
      author_avatar: 'https://cdn.discordapp.com/avatars/735152588801966132/test.png',
      category: 'Valorant',
      game_name: 'Valorant',
      caption: '1v5 clutch ace on Split',
      media_type: 'video_discord',
      created_at: 1789900000000
    },
    user: {
      displayAvatarURL: () => 'https://cdn.discordapp.com/avatars/735152588801966132/test.png'
    },
    config: { SITE_URL: 'https://asikvestel.org' }
  });
  assert.ok(clipPayload.embeds && clipPayload.embeds.length === 1);
  assert.ok(clipPayload.components && clipPayload.components.length === 1);
  const clipEmbed = clipPayload.embeds[0].data;
  assert.strictEqual(clipEmbed.color, BOT_COLORS.PRIMARY);
  assert.ok(clipEmbed.title.includes('Valorant'));
  assert.ok(clipEmbed.description.includes('1v5 clutch ace on Split'));
  assert.strictEqual(clipEmbed.fields.length, 3);
  assert.strictEqual(clipPayload.components[0].components[0].data.label, 'Arşivde İzle');
  assert.strictEqual(clipPayload.components[0].components[0].data.url, 'https://asikvestel.org/archive/');

  // 2. GIF / Image embed
  const gifPayload = createImageEmbed({
    imageData: {
      user_name: 'cagatay',
      user_avatar: 'https://cdn.discordapp.com/avatars/123/avatar.png',
      title: 'Cat dance meme',
      category: 'Meme',
      media_type: 'gif',
      image_url: 'https://tenor.com/view/cat.gif',
      created_at: 1789900000000
    },
    user: null,
    config: { SITE_URL: 'https://asikvestel.org' }
  });
  assert.ok(gifPayload.embeds && gifPayload.embeds.length === 1);
  const gifEmbed = gifPayload.embeds[0].data;
  assert.strictEqual(gifEmbed.color, BOT_COLORS.CYAN);
  assert.ok(gifEmbed.title.includes('GIF Kasasına'));
  assert.strictEqual(gifEmbed.thumbnail.url, 'https://tenor.com/view/cat.gif');
  assert.strictEqual(gifPayload.components[0].components[0].data.label, 'Kasayı İncele');
  assert.strictEqual(gifPayload.components[0].components[0].data.url, 'https://asikvestel.org/media/');

  // 3. Council quote embed
  const quotePayload = createQuoteEmbed({
    quote: 'Biz bu yola baş koyduk',
    author: 'Barb',
    taggedUser: { id: '735152588801966132', displayAvatarURL: () => 'https://avatar.png' },
    addedBy: 'imbarb',
    id: 42,
    config: { SITE_URL: 'https://asikvestel.org' }
  });
  const quoteEmbed = quotePayload.embeds[0].data;
  assert.strictEqual(quoteEmbed.color, BOT_COLORS.AMBER);
  assert.strictEqual(quoteEmbed.title, '📜 Söz #42');
  assert.ok(quoteEmbed.description.includes('Biz bu yola baş koyduk'));
  assert.ok(quoteEmbed.fields.some(f => f.name.includes('Sahibi') && f.value.includes('<@735152588801966132>')));
  assert.strictEqual(quotePayload.components[0].components[0].data.label, 'Sitede Gör');
  assert.strictEqual(quotePayload.components[0].components[0].data.url, 'https://asikvestel.org/council/');

  // 4. Archive stats embed
  const statsPayload = createStatsEmbed({
    stats: {
      totalClips: 1540,
      totalImages: 320,
      categories: [
        { category: 'Valorant', c: 800 },
        { category: 'League of Legends', c: 450 },
        { category: 'Meme', c: 290 }
      ]
    },
    config: { SITE_URL: 'https://asikvestel.org' }
  });
  const statsEmbed = statsPayload.embeds[0].data;
  assert.strictEqual(statsEmbed.color, BOT_COLORS.PRIMARY);
  assert.ok(statsEmbed.fields.some(f => f.name.includes('Toplam Klip')));
  assert.ok(statsEmbed.fields.some(f => f.name.includes('Toplam Görsel')));
  assert.strictEqual(statsPayload.components[0].components.length, 2);
  assert.strictEqual(statsPayload.components[0].components[0].data.label, 'Arşivi Aç');
  assert.strictEqual(statsPayload.components[0].components[1].data.label, 'Görselleri Aç');
});

test('Bot Embeds: operational telemetry, system status, and alert embeds', () => {
  // 1. VPS system telemetry embed
  const mockStats = {
    cpu: { model: 'AMD EPYC 7763', cores: 4, loadAvg: [0.35, 0.42, 0.50] },
    memory: { totalBytes: 8589934592, freeBytes: 4294967296, usedBytes: 4294967296, usedPercent: 50, processRssBytes: 104857600, processHeapUsedBytes: 52428800 },
    uptime: { systemUptimeSeconds: 864000, processUptimeSeconds: 36000 },
    os: { platform: 'linux', arch: 'x64', release: '6.8.0', nodeVersion: 'v20.20.2' }
  };

  const sysPayload = createSystemEmbed({
    stats: mockStats,
    formatBytes: (b) => `${(b / (1024 * 1024)).toFixed(0)} MB`,
    formatDuration: (s) => `${Math.floor(s / 3600)}s`
  });

  const sysEmbed = sysPayload.embeds[0].data;
  assert.strictEqual(sysEmbed.color, BOT_COLORS.SUCCESS);
  assert.ok(sysEmbed.title.includes('VPS Sistem'));
  assert.ok(sysEmbed.fields.some(f => f.name.includes('İşlemci')));
  assert.ok(sysEmbed.fields.some(f => f.name.includes('RAM')));

  // 2. Status alerts (success, error, warning)
  const successAlert = createStatusAlertEmbed({ type: 'success', title: 'Başarılı', message: 'İşlem bitti' });
  assert.strictEqual(successAlert.embeds[0].data.color, BOT_COLORS.SUCCESS);
  assert.ok(successAlert.embeds[0].data.title.includes('Başarılı'));

  const errorAlert = createStatusAlertEmbed({ type: 'error', title: 'Hata Oluştu', message: 'Geçersiz parametre' });
  assert.strictEqual(errorAlert.embeds[0].data.color, BOT_COLORS.DANGER);
  assert.ok(errorAlert.embeds[0].data.title.includes('Hata Oluştu'));

  const warnAlert = createStatusAlertEmbed({ type: 'warning', title: 'Uyarı', message: 'Yetkisiz erişim' });
  assert.strictEqual(warnAlert.embeds[0].data.color, BOT_COLORS.AMBER);
  assert.ok(warnAlert.embeds[0].data.title.includes('Uyarı'));

  // 3. Media host storage embed (/media-stats)
  const mediaHostPayload = createMediaHostStatsEmbed({
    stats: {
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
    config: { MEDIA_HOST_URL: 'https://media.asikvestel.org' }
  });

  assert.strictEqual(mediaHostPayload.embeds.length, 1);
  assert.strictEqual(mediaHostPayload.components.length, 1);
  const mediaEmbed = mediaHostPayload.embeds[0].data;
  assert.strictEqual(mediaEmbed.color, BOT_COLORS.SUCCESS);
  assert.ok(mediaEmbed.title.includes('media.asikvestel.org'));
  assert.ok(mediaEmbed.fields.some(f => f.name.includes('Cloudflare R2')));
  assert.ok(mediaEmbed.fields.some(f => f.name.includes('NVMe Disk')));
  assert.ok(mediaEmbed.fields.some(f => f.name.includes('Kullanıcılar')));
  assert.strictEqual(mediaHostPayload.components[0].components[0].data.label, 'Medya Paneli');
  assert.strictEqual(mediaHostPayload.components[0].components[1].data.custom_id, 'media_stats_refresh');
});
