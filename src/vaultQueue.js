/**
 * Runs async tasks with at most `maxActive` at a time and `maxQueued` waiting.
 * A vault copy holds up to 50 MB in memory (about twice over while it is encrypted), and PM2 restarts
 * the bot at 350 MB, so a burst of uploads has to wait its turn.
 * Returns enqueue(task): a promise for the task's result, or null when the queue is full.
 */
function createQueue({ maxActive = 2, maxQueued = 50 } = {}) {
  let active = 0;
  const waiting = [];

  function next() {
    while (active < maxActive && waiting.length > 0) {
      active++;
      waiting.shift()().finally(() => {
        active--;
        next();
      });
    }
  }

  return function enqueue(task) {
    if (waiting.length >= maxQueued) return null;
    return new Promise((resolve, reject) => {
      waiting.push(() => task().then(resolve, reject));
      next();
    });
  };
}

module.exports = { createQueue };
