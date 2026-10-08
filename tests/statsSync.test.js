const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { initDb, insertClip } = require('../src/db');
const { syncPublicStatsFile } = require('../src/statsSync');

const TEST_DB = path.join(__dirname, 'test_sync_clips.db');
const TEST_STATS_JSON = path.join(__dirname, 'test_stats.json');

test.beforeEach(() => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  if (fs.existsSync(TEST_STATS_JSON)) fs.unlinkSync(TEST_STATS_JSON);
  initDb(TEST_DB);
});

test.afterEach(() => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  if (fs.existsSync(TEST_STATS_JSON)) fs.unlinkSync(TEST_STATS_JSON);
});

test('StatsSync: creates stats.json and updates clipCount accurately for all clips', () => {
  insertClip({
    message_id: 'm1',
    channel_id: 'c1',
    author_id: 'u1',
    author_name: 'P1',
    category: 'Valorant',
    media_type: 'video_discord',
    media_url: 'https://cdn.discordapp.com/attachments/m1.mp4',
    message_url: 'https://discord.com/channels/1/1/1',
    created_at: 1726000000000
  });

  insertClip({
    message_id: 'm2',
    channel_id: 'c1',
    author_id: 'u1',
    author_name: 'P1',
    category: 'Valorant',
    media_type: 'youtube',
    media_url: 'https://youtube.com/watch?v=123',
    message_url: 'https://discord.com/channels/1/1/2',
    created_at: 1726000001000
  });

  const result = syncPublicStatsFile(TEST_STATS_JSON);
  assert.strictEqual(result.clipCount, 2);
  assert.ok(fs.existsSync(TEST_STATS_JSON));

  const saved = JSON.parse(fs.readFileSync(TEST_STATS_JSON, 'utf8'));
  assert.strictEqual(saved.clipCount, 2);
  assert.ok(saved.lastUpdated > 0);
});
