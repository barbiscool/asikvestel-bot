const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { initDb, closeDb, insertImage, getDb } = require('../src/db');
const { migrateBacklog } = require('../scripts/migrate-vault-backlog');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'av-backlog-'));
test.before(() => {
  initDb(path.join(dir, 'b.db'));
  for (const n of ['a', 'b', 'c', 'd']) {
    insertImage({ user_id: '1', user_name: 'u', title: n, media_type: 'image', image_url: `https://example.com/${n}.png`, created_at: 1 });
  }
});
test.after(() => { closeDb(); fs.rmSync(dir, { recursive: true, force: true }); });

const blobIds = () => getDb().prepare('SELECT title, blob_id FROM images_vault ORDER BY id').all();

test('backlog migration: a failing row is skipped, the others get a blob, a rerun finds nothing left but the failure', async () => {
  const quiet = { log: () => {}, minFreeBytes: 0, freeBytesOf: () => 1e12, batchSize: 2 };
  const dry = await migrateBacklog('images', { ...quiet, dryRun: true });
  assert.deepStrictEqual([dry.processed, dry.succeeded], [4, 4]);
  assert.ok(blobIds().every((r) => !r.blob_id), 'dry run writes nothing');

  const res = await migrateBacklog('images', {
    ...quiet,
    fetchBuffer: async (url) => { if (url.endsWith('/b.png')) throw new Error('gone'); return Buffer.from(url); },
    saveBlob: async (buf) => ({ blobId: `blob-${buf.toString().slice(-5, -4)}` })
  });
  assert.deepStrictEqual([res.processed, res.succeeded, res.failed], [4, 3, 1]);
  const byTitle = Object.fromEntries(blobIds().map((r) => [r.title, r.blob_id]));
  assert.deepStrictEqual(byTitle, { a: 'blob-a', b: null, c: 'blob-c', d: 'blob-d' });

  const again = await migrateBacklog('images', { ...quiet, fetchBuffer: async () => { throw new Error('gone'); } });
  assert.deepStrictEqual([again.processed, again.failed], [1, 1]);
});

test('backlog migration: stops when the vault disk is nearly full', async () => {
  const res = await migrateBacklog('images', { log: () => {}, freeBytesOf: () => 1, minFreeBytes: 1000 });
  assert.strictEqual(res.processed, 0);
  assert.match(res.stoppedFor, /free/);
});
