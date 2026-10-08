const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const {
  formatBytes,
  readHostDiskSpace,
  getMediaHostStats,
  checkAndAlertStorage,
  initMediaStorageWatchdog,
  stopMediaStorageWatchdog
} = require('../src/mediaStorageWatchdog');

test('MediaStorageWatchdog: formatBytes helper', () => {
  assert.strictEqual(formatBytes(0), '0 B');
  assert.strictEqual(formatBytes(-100), '0 B');
  assert.strictEqual(formatBytes(1024), '1.00 KB');
  assert.strictEqual(formatBytes(1048576), '1.00 MB');
  assert.strictEqual(formatBytes(1073741824), '1.00 GB');
});

test('MediaStorageWatchdog: readHostDiskSpace', () => {
  const disk = readHostDiskSpace();
  assert.ok(typeof disk.totalBytes === 'number');
  assert.ok(typeof disk.freeBytes === 'number');
  assert.ok(typeof disk.percentFree === 'string');
  assert.ok(typeof disk.percentUsed === 'string');
  assert.ok(typeof disk.freeFormatted === 'string');
  assert.ok(typeof disk.totalFormatted === 'string');
});

test('MediaStorageWatchdog: getMediaHostStats fallback when db missing', () => {
  const stats = getMediaHostStats({ MEDIA_DB_PATH: '/nonexistent/path/media.db' });
  assert.strictEqual(stats.available, false);
  assert.strictEqual(stats.r2.maxBytes, 10737418240);
  assert.strictEqual(stats.r2.usedBytes, 0);
  assert.strictEqual(stats.stats.totalFiles, 0);
});

test('MediaStorageWatchdog: checkAndAlertStorage with mock Discord client', async () => {
  let sentMessages = [];
  const mockClient = {
    users: {
      fetch: async (id) => ({
        id,
        send: async (payload) => {
          sentMessages.push(payload);
          return true;
        }
      })
    }
  };

  // Healthy storage should not alert without force
  const alertedHealthy = await checkAndAlertStorage(mockClient, {
    ADMIN_DISCORD_USER_ID: '735152588801966132',
    MEDIA_DB_PATH: '/nonexistent/path/media.db'
  }, false);

  assert.strictEqual(alertedHealthy, false);
  assert.strictEqual(sentMessages.length, 0);

  // Forced check should send DM to admin
  const alertedForced = await checkAndAlertStorage(mockClient, {
    ADMIN_DISCORD_USER_ID: '735152588801966132',
    MEDIA_DB_PATH: '/nonexistent/path/media.db'
  }, true);

  assert.strictEqual(alertedForced, true);
  assert.strictEqual(sentMessages.length, 1);
  assert.ok(sentMessages[0].content.includes('735152588801966132'));
  assert.ok(sentMessages[0].embeds.length > 0);
});

test('MediaStorageWatchdog: timer lifecycle start and stop', () => {
  initMediaStorageWatchdog(null, {});
  stopMediaStorageWatchdog();
  // Safe to call multiple times
  stopMediaStorageWatchdog();
});
