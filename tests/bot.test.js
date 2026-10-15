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

test('duplicate insert does not attach a vault blob to an unrelated row', async () => {
  const { insertImage, getImageById } = require('../src/db');
  const { encryptToVault } = require('../src/bot');
  const img = { user_id: '1', user_name: 'a', title: 't', media_type: 'gif', created_at: 1 };
  const first = insertImage({ ...img, image_url: 'https://cdn.discordapp.com/a.gif' });
  insertImage({ ...img, image_url: 'https://cdn.discordapp.com/b.gif' });
  const dupe = insertImage({ ...img, image_url: 'https://cdn.discordapp.com/a.gif' });
  assert.strictEqual(dupe.changes, 0);

  const realFetch = global.fetch;
  let fetched = 0;
  global.fetch = async () => { fetched++; throw new Error('should not fetch'); };
  try {
    assert.strictEqual(encryptToVault('https://cdn.discordapp.com/a.gif', dupe, () => assert.fail('saved')), null);
  } finally {
    global.fetch = realFetch;
  }
  assert.strictEqual(fetched, 0);
  assert.strictEqual(getImageById(first.lastInsertRowid).blob_id, null);
});

test('emoji reactions only recategorize a clip for its author or the admin', async () => {
  const { insertClip, getClipByMessageId } = require('../src/db');
  insertClip({
    message_id: 'm1', channel_id: 'c', author_id: 'author', author_name: 'a', category: 'Valorant',
    media_type: 'video_discord', media_url: 'https://cdn.discordapp.com/m1.mp4', message_url: 'u', created_at: 1
  });
  const client = createBotClient({ BOT_TOKEN: '', ADMIN_DISCORD_USER_ID: ADMIN_ID });
  const react = (userId) => Promise.all(client.listeners('messageReactionAdd').map((fn) =>
    fn({ partial: false, emoji: { name: '😂' }, message: { id: 'm1' } }, { id: userId, bot: false })));

  await react('stranger');
  assert.strictEqual(getClipByMessageId('m1').category, 'Valorant');
  await react('author');
  assert.strictEqual(getClipByMessageId('m1').category, 'Meme');
  client.removeAllListeners();
});
