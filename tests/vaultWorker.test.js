const test = require('node:test');
const assert = require('node:assert');
const { fetchMediaBuffer } = require('../src/vaultWorker');

const PUBLIC = 'http://93.184.216.34/x.gif'; // IP literal: no DNS needed

function withFetch(fake, fn) {
  const real = global.fetch;
  global.fetch = fake;
  return fn().finally(() => { global.fetch = real; });
}

test('fetchMediaBuffer blocks internal addresses in any spelling', async () => {
  for (const url of [
    'http://localhost/x.gif',
    'http://127.0.0.1:4500/x.gif',
    'http://0x7f.1/x.gif',
    'http://[::1]/x.gif',
    'http://[::ffff:127.0.0.1]/x.gif',
    'http://169.254.169.254/latest/meta-data',
    'http://10.1.2.3/x.gif',
    'http://0.0.0.0/x.gif'
  ]) {
    await assert.rejects(fetchMediaBuffer(url), /SSRF blocked/, url);
  }
  await assert.rejects(fetchMediaBuffer('file:///etc/passwd'), /Unsupported protocol/);
});

test('fetchMediaBuffer re-checks the host on every redirect', async () => {
  let calls = 0;
  await withFetch(async () => {
    calls++;
    return new Response(null, { status: 302, headers: { location: 'http://127.0.0.1:4000/admin' } });
  }, () => assert.rejects(fetchMediaBuffer(PUBLIC), /SSRF blocked/));
  assert.strictEqual(calls, 1);
});

test('fetchMediaBuffer caps the body even without content-length', async () => {
  const chunk = new Uint8Array(1024 * 1024);
  let sent = 0;
  const body = new ReadableStream({
    pull(c) { sent++; if (sent > 60) c.close(); else c.enqueue(chunk); }
  });
  await withFetch(async () => new Response(body), () =>
    assert.rejects(fetchMediaBuffer(PUBLIC), /exceeds limit/));
  assert.ok(sent < 60, 'stopped reading early');
});

test('fetchMediaBuffer returns the body of a normal response', async () => {
  await withFetch(async () => new Response('gifdata'), async () => {
    assert.strictEqual((await fetchMediaBuffer(PUBLIC)).toString(), 'gifdata');
  });
});

test('fetchMediaBuffer: the size cap can be raised for one call, and the default stays 50 MB', async () => {
  const big = () => new Response(new Uint8Array(51 * 1024 * 1024));
  await withFetch(async () => big(), () => assert.rejects(fetchMediaBuffer(PUBLIC), /exceeds limit/));
  await withFetch(async () => big(), async () => {
    assert.strictEqual((await fetchMediaBuffer(PUBLIC, { maxBytes: 600 * 1024 * 1024 })).length, 51 * 1024 * 1024);
  });
});
