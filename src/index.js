require('dotenv').config();
const config = require('./config');
const { initDb, closeDb } = require('./db');
const { createBotClient } = require('./bot');
const { flushActiveVoiceSessions } = require('./vcTracker');

async function main() {
  console.log('----------------------------------------------------');
  console.log('🤖 Starting Aşık Vestel Discord Bot (Standalone)...');
  console.log('----------------------------------------------------');

  // 1. Initialize SQLite Database
  initDb();
  console.log('[Bot Init] SQLite database connected and initialized.');

  // 2. Validate token
  if (!config.BOT_TOKEN) {
    console.error('[Bot Init] FATAL: DISCORD_BOT_TOKEN is not defined in environment variables or .env!');
    process.exit(1);
  }

  // 3. Create and login bot client
  const client = createBotClient(config);

  try {
    await client.login(config.BOT_TOKEN);
    console.log('[Bot Init] Successfully connected to Discord Gateway.');
  } catch (err) {
    console.error('[Bot Init] Login failed:', err.message);
    process.exit(1);
  }

  // Graceful shutdown handling
  const shutdown = async (signal) => {
    console.log(`\n[Bot Shutdown] Received ${signal}. Cleaning up...`);
    try {
      flushActiveVoiceSessions();
      if (client && client.destroy) {
        await client.destroy();
      }
      closeDb();
      console.log('[Bot Shutdown] Database closed and sessions saved. Goodbye!');
      process.exit(0);
    } catch (err) {
      console.error('[Bot Shutdown] Error during clean exit:', err.message);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

if (require.main === module) {
  main().catch(err => {
    console.error('[Bot Init] Uncaught exception:', err);
    process.exit(1);
  });
}

module.exports = { main };
