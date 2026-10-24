const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { initDb, closeDb, getClips } = require('../src/db');

const TEST_DB = path.join(__dirname, 'test_db_guards.db');

test('getClips: inherited keys are not game aliases and a huge page is clamped', () => {
  for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) if (fs.existsSync(f)) fs.unlinkSync(f);
  initDb(TEST_DB);
  try {
    // 'constructor' used to resolve to Object's function and break the alias lookup
    assert.doesNotThrow(() => getClips({ query: 'constructor' }));
    assert.strictEqual(getClips({ page: '99999999999999999999' }).page, 1e6);
  } finally {
    closeDb();
    for (const f of [TEST_DB, `${TEST_DB}-wal`, `${TEST_DB}-shm`]) if (fs.existsSync(f)) fs.unlinkSync(f);
  }
});
