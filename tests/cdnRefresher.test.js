const test = require('node:test');
const assert = require('node:assert');
const { isUrlExpired, refreshAttachmentUrls } = require('../src/cdnRefresher');

test('cdnRefresher: Discord CDN URL expiry checking', () => {
  const expiredUrl = 'https://cdn.discordapp.com/attachments/1/2/clip.mp4?ex=65000000&is=65000000&hm=xyz';
  assert.strictEqual(isUrlExpired(expiredUrl), true);

  const validUrl = 'https://cdn.discordapp.com/attachments/1/2/clip.mp4?ex=7ffffff0&is=7ffffff0&hm=xyz';
  assert.strictEqual(isUrlExpired(validUrl), false);

  const nonExpiringUrl = 'https://youtube.com/watch?v=123';
  assert.strictEqual(isUrlExpired(nonExpiringUrl), false);
});

test('cdnRefresher: a refreshed link is remembered, and a stuck Discord call is cut off', async () => {
  const old = 'https://cdn.discordapp.com/attachments/1/2/a.mp4?ex=65000000&is=1&hm=x';
  const realFetch = global.fetch;
  let calls = 0, signal = null;
  global.fetch = async (url, opts) => { calls++; signal = opts.signal; return new Response(JSON.stringify({ refreshed_urls: [{ original: old, refreshed: old + '&fresh=1' }] }), { status: 200 }); };
  try {
    assert.deepStrictEqual(await refreshAttachmentUrls('token', [old]), { [old]: old + '&fresh=1' });
    assert.deepStrictEqual(await refreshAttachmentUrls('token', [old]), { [old]: old + '&fresh=1' });
    assert.strictEqual(calls, 1, 'the second page of clips did not ask Discord again');
    assert.ok(signal instanceof AbortSignal, 'the call has a timeout');
  } finally { global.fetch = realFetch; }
});
