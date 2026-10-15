const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { initDb, closeDb, grantDbFeatureAccess } = require('../src/db');
const { createBotClient } = require('../src/bot');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-bot-test-'));
const ADMIN_ID = '735152588801966132';

test.before(() => initDb(path.join(dir, 'bot.db')));
test.after(() => {
  closeDb();
  fs.rmSync(dir, { recursive: true, force: true });
});

function fakeInteraction(commandName, { userId = ADMIN_ID, sub = null, strings = {} } = {}) {
  const calls = [];
  return {
    calls,
    commandName,
    user: { id: userId, username: 'someone', tag: 'someone' },
    deferred: false,
    replied: false,
    isChatInputCommand: () => true,
    options: {
      getSubcommand: () => sub,
      getString: (name) => strings[name] ?? null,
      getUser: () => null
    },
    async deferReply() { this.deferred = true; },
    async reply(p) { this.replied = true; calls.push(p); },
    async editReply(p) { calls.push(p); }
  };
}

async function dispatch(interaction) {
  const client = createBotClient({ BOT_TOKEN: '', ADMIN_DISCORD_USER_ID: ADMIN_ID });
  const listeners = client.listeners('interactionCreate');
  await Promise.all(listeners.map((fn) => fn(interaction)));
  client.removeAllListeners();
}

test('/feature list renders the grant list instead of throwing', async () => {
  grantDbFeatureAccess('wrapped', '42', 'tester');
  const i = fakeInteraction('feature', { sub: 'list', strings: { ozellik: 'wrapped' } });
  await dispatch(i);
  assert.strictEqual(i.calls.length, 1);
  assert.match(i.calls[0].embeds[0].title, /WRAPPED İzin Listesi/);
});

test('a failing command answers with an error instead of crashing', async () => {
  const i = fakeInteraction('kategori-degistir', { strings: {} }); // no link → .match on null throws
  await dispatch(i);
  assert.strictEqual(i.calls.length, 1);
  assert.ok(i.calls[0].embeds, 'error embed sent');
});
