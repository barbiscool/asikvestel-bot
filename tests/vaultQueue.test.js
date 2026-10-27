const test = require('node:test');
const assert = require('node:assert');
const { createQueue } = require('../src/vaultQueue');

test('vaultQueue: runs at most maxActive tasks at once and drops work when full', async () => {
  const enqueue = createQueue({ maxActive: 2, maxQueued: 2 });
  let running = 0;
  let peak = 0;
  const releases = [];
  const task = () => new Promise((resolve) => {
    running++;
    peak = Math.max(peak, running);
    releases.push(() => { running--; resolve('done'); });
  });

  const results = [enqueue(task), enqueue(task), enqueue(task), enqueue(task)];
  assert.strictEqual(running, 2, 'two started, two waiting');
  assert.strictEqual(enqueue(task), null, 'queue is full');

  let finished = 0;
  while (finished < 4) { // each release lets the next waiting task start
    const batch = releases.splice(0);
    batch.forEach((release) => release());
    finished += batch.length;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.deepStrictEqual(await Promise.all(results), ['done', 'done', 'done', 'done']);
  assert.strictEqual(peak, 2);
});

test('vaultQueue: a failing task rejects its own promise and frees the slot', async () => {
  const enqueue = createQueue({ maxActive: 1, maxQueued: 5 });
  const bad = enqueue(async () => { throw new Error('boom'); });
  const good = enqueue(async () => 'ok');
  await assert.rejects(bad, /boom/);
  assert.strictEqual(await good, 'ok');
});
