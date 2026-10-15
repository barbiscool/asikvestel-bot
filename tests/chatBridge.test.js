const test = require('node:test');
const assert = require('node:assert');
const { ChatBridge } = require('../src/chatBridge');

const CHANNEL = '1072955073421901834';

function discordJsMessage(id) {
  return {
    id,
    channelId: CHANNEL,
    content: 'hey <@42>',
    createdAt: new Date(1000), // discord.js gives a Date, not a number
    createdTimestamp: 1000,
    author: { id: '7', username: 'u', displayAvatarURL: () => 'https://cdn.discordapp.com/a.png' },
    member: { displayName: 'User' },
    mentions: { users: new Map([['42', { username: 'friend' }]]) },
    attachments: new Map()
  };
}

function withFetch(fake, fn) {
  const real = global.fetch;
  global.fetch = fake;
  try { return fn(); } finally { global.fetch = real; }
}

test('bot relays a discord.js message once, formatted, only with URL and secret set', () => {
  const sent = [];
  const fakeFetch = async (url, opts) => { sent.push({ url, opts }); return new Response('{}'); };

  withFetch(fakeFetch, () => {
    const noSecret = new ChatBridge();
    noSecret.init(null, { CHAT_CHANNELS: { [CHANNEL]: { id: CHANNEL } }, WEB_API_URL: 'http://127.0.0.1:4000' });
    noSecret.handleIncomingMessage(discordJsMessage('1'));
    assert.strictEqual(sent.length, 0, 'no relay without CHAT_BRIDGE_INTERNAL_SECRET');

    const bridge = new ChatBridge();
    bridge.init(null, {
      CHAT_CHANNELS: { [CHANNEL]: { id: CHANNEL } },
      WEB_API_URL: 'http://127.0.0.1:4000/',
      CHAT_BRIDGE_INTERNAL_SECRET: 's3cret'
    });
    bridge.handleIncomingMessage(discordJsMessage('2'));
    bridge.handleIncomingMessage(discordJsMessage('2'));
  });

  assert.strictEqual(sent.length, 1, 'duplicate not relayed twice');
  assert.strictEqual(sent[0].url, 'http://127.0.0.1:4000/api/chat/internal/incoming');
  assert.strictEqual(sent[0].opts.headers['x-internal-secret'], 's3cret');
  const { message } = JSON.parse(sent[0].opts.body);
  assert.strictEqual(message.content, 'hey @friend');
  assert.strictEqual(message.author.avatarUrl, 'https://cdn.discordapp.com/a.png');
});
