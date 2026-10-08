const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { initDb, getPublicVcHours, addVoiceSeconds, getVcStatsRaw } = require('../src/db');
const { 
  TRACKED_GUILDS,
  activeVoiceSessions, 
  handleVoiceStateUpdate, 
  flushActiveVoiceSessions 
} = require('../src/vcTracker');

const TEST_DB = path.join(__dirname, 'test_vc_tracking.db');

test.beforeEach(() => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  initDb(TEST_DB);
  activeVoiceSessions.clear();
});

test.afterEach(() => {
  if (fs.existsSync(TEST_DB)) fs.unlinkSync(TEST_DB);
  activeVoiceSessions.clear();
});

test('VC Tracker: baseline stats, accumulation, and guild/bot filtering', () => {
  // 1. Initial base stats check
  assert.strictEqual(getPublicVcHours(), '3,490+');
  const raw = getVcStatsRaw();
  assert.strictEqual(raw.base_seconds, 12564000);
  assert.strictEqual(raw.tracked_seconds, 0);

  // 2. Direct time accumulation
  addVoiceSeconds(3600);
  assert.strictEqual(getPublicVcHours(), '3,491+');
  addVoiceSeconds(7200);
  assert.strictEqual(getPublicVcHours(), '3,493+');

  // 3. Ignore bots and untracked guilds
  handleVoiceStateUpdate({ channelId: null }, {
    guild: { id: TRACKED_GUILDS[0] },
    member: { id: 'bot_1', user: { bot: true } },
    channelId: 'vc_1'
  });
  assert.strictEqual(activeVoiceSessions.size, 0);

  handleVoiceStateUpdate({ channelId: null }, {
    guild: { id: 'random_guild_999' },
    member: { id: 'user_1', user: { bot: false } },
    channelId: 'vc_1'
  });
  assert.strictEqual(activeVoiceSessions.size, 0);
});

test('VC Tracker: lifecycle records join, in-flight flush, and leave', () => {
  const guildId = TRACKED_GUILDS[0];
  const userId = 'member_123';

  // 1. Join VC
  handleVoiceStateUpdate({ channelId: null }, {
    guild: { id: guildId },
    member: { id: userId, user: { bot: false } },
    channelId: 'vc_general'
  });
  assert.strictEqual(activeVoiceSessions.size, 1);
  const session = activeVoiceSessions.get(userId);
  assert.strictEqual(session.guildId, guildId);

  // Manipulate joinedAt to simulate 2 hours elapsed
  session.joinedAt = Date.now() - (7200 * 1000);

  // 2. Flush in-flight sessions
  flushActiveVoiceSessions();
  assert.strictEqual(getPublicVcHours(), '3,492+');
  assert.strictEqual(activeVoiceSessions.size, 1);

  // 3. User leaves VC after another 3600 seconds
  session.joinedAt = Date.now() - (3600 * 1000);
  handleVoiceStateUpdate({
    guild: { id: guildId },
    member: { id: userId, user: { bot: false } },
    channelId: 'vc_general'
  }, {
    guild: { id: guildId },
    member: { id: userId, user: { bot: false } },
    channelId: null
  });

  assert.strictEqual(activeVoiceSessions.size, 0);
  assert.strictEqual(getPublicVcHours(), '3,493+');
});
