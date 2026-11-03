const test = require('node:test');
const assert = require('node:assert');
const { isValidMinecraftName, sendWhitelistCommand } = require('../src/iauPanel');

const cfg = { IAU_PANEL_URL: 'https://panel.example', IAU_SERVER_ID: 'abc12345', IAU_PANEL_API_KEY: 'ptlc_secret' };

test('username validation matches Java rules', () => {
  for (const ok of ['Steve', 'a_b', 'Name_With_16char']) assert.ok(isValidMinecraftName(ok), ok);
  for (const bad of ['ab', 'seventeen_chars_xx', 'bad name', 'a"b', 'x;y', '', null]) assert.ok(!isValidMinecraftName(bad), String(bad));
});

test('add sends the right request and reports 204 as ok', async () => {
  const realFetch = global.fetch;
  let seen;
  global.fetch = async (url, opts) => { seen = { url, opts }; return { status: 204 }; };
  try {
    const r = await sendWhitelistCommand(cfg, 'add', 'Steve_01');
    assert.deepStrictEqual(r, { ok: true, status: 204 });
    assert.strictEqual(seen.url, 'https://panel.example/api/client/servers/abc12345/command');
    assert.strictEqual(seen.opts.headers.Authorization, 'Bearer ptlc_secret');
    assert.deepStrictEqual(JSON.parse(seen.opts.body), { command: 'whitelist add Steve_01' });
  } finally { global.fetch = realFetch; }
});

test('rejects bad names and missing key without calling the panel', async () => {
  const realFetch = global.fetch;
  global.fetch = async () => { throw new Error('should not be called'); };
  try {
    assert.strictEqual((await sendWhitelistCommand(cfg, 'add', 'a"b')).error, 'invalid-name');
    assert.strictEqual((await sendWhitelistCommand({ ...cfg, IAU_PANEL_API_KEY: '' }, 'add', 'Steve')).error, 'no-key');
  } finally { global.fetch = realFetch; }
});

test('non-204 and network failures are not ok', async () => {
  const realFetch = global.fetch;
  try {
    global.fetch = async () => ({ status: 403 });
    assert.deepStrictEqual(await sendWhitelistCommand(cfg, 'list'), { ok: false, status: 403 });
    global.fetch = async () => { throw new Error('down'); };
    assert.strictEqual((await sendWhitelistCommand(cfg, 'remove', 'Steve')).error, 'network');
  } finally { global.fetch = realFetch; }
});
