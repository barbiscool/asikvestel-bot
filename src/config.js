const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

function getEnv(key, defaultValue = undefined) {
  const value = process.env[key];
  if (value !== undefined && value !== '') {
    return value;
  }
  return defaultValue;
}

const config = {
  PORT: parseInt(getEnv('PORT', '4000'), 10),
  NODE_ENV: getEnv('NODE_ENV', 'development'),

  // Discord Bot Credentials
  BOT_TOKEN: getEnv('DISCORD_BOT_TOKEN', ''),
  CLIENT_ID: getEnv('DISCORD_CLIENT_ID', ''),
  CLIENT_SECRET: getEnv('DISCORD_CLIENT_SECRET', ''),

  // Guilds
  GUILD_ID: getEnv('DISCORD_GUILD_ID', '1389232967271972914').split(',')[0]?.trim() || '1389232967271972914',
  GUILD_IDS: getEnv('DISCORD_GUILD_ID', '1389232967271972914,1061058726137692332')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  AUTH_GUILD_ID: getEnv('AUTH_GUILD_ID', '1389232967271972914'),
  AV2_GUILD_ID: getEnv('AV2_GUILD_ID', '1061058726137692332'),

  // Channel IDs
  CLIPS_CHANNELS: getEnv('CLIPS_CHANNEL_IDS', '1508809916905685224,1389232968140062823')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  MEDIA_SCAN_CHANNEL_IDS: getEnv('MEDIA_SCAN_CHANNEL_IDS', '1508809916905685224,1389232968140062823,1210949927702757447,1072955073421901834')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),
  SCAN_NEW_SERVER_CHANNEL_IDS: getEnv('SCAN_NEW_SERVER_CHANNEL_IDS', '1072955073421901834,1210949927702757447,1200902533573513307')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),

  // Chat channels & routing
  DEFAULT_CHAT_CHANNEL_ID: getEnv('DISCORD_CHAT_CHANNEL_ID', '1072955073421901834'),
  CHAT_CHANNEL_ID: getEnv('DISCORD_CHAT_CHANNEL_ID', '1072955073421901834'),
  CHAT_CHANNEL_ISTANBUL_ID: getEnv('CHAT_CHANNEL_ISTANBUL_ID', '1072955073421901834'),
  CHAT_CHANNEL_ANKARA_ID: getEnv('CHAT_CHANNEL_ANKARA_ID', '1389232968140062823'),

  get CHAT_CHANNELS() {
    const istanbulId = this.CHAT_CHANNEL_ISTANBUL_ID || '1072955073421901834';
    const ankaraId = this.CHAT_CHANNEL_ANKARA_ID || '1389232968140062823';
    return {
      [istanbulId]: {
        id: istanbulId,
        name: 'kanalistanbul',
        guildId: this.AV2_GUILD_ID || '1061058726137692332',
        guildName: 'Aşık Vestel',
        description: 'Aşık Vestel Ana Sohbet Kanalı'
      },
      [ankaraId]: {
        id: ankaraId,
        name: 'kanalankara',
        guildId: this.AUTH_GUILD_ID || '1389232967271972914',
        guildName: 'Aşık Vestel 2.0',
        description: 'Aşık Vestel 2.0 Sohbet Kanalı'
      }
    };
  },

  // Users / Admins / Restrictions
  ADMIN_USERNAME: getEnv('ADMIN_USERNAME', 'imbarb'),
  ADMIN_DISCORD_USER_ID: getEnv('ADMIN_DISCORD_USER_ID', '735152588801966132'),
  get ADMIN_USER_ID() { return this.ADMIN_DISCORD_USER_ID; },
  BLOCKED_FEATURE_USER_IDS: getEnv('BLOCKED_FEATURE_USER_IDS', '676125827368484933')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean),

  // Known members mapping for Discord chat mention resolver (optional JSON string from .env)
  get KNOWN_MEMBERS() {
    const raw = getEnv('DISCORD_KNOWN_MEMBERS_JSON', '');
    if (raw) {
      try {
        return JSON.parse(raw);
      } catch (err) {
        console.warn('[Config] Failed to parse DISCORD_KNOWN_MEMBERS_JSON:', err.message);
      }
    }
    return {};
  },

  // Web & Auth
  SITE_URL: getEnv('SITE_URL', 'http://localhost:4000'),
  OAUTH_REDIRECT_URI: getEnv('OAUTH_REDIRECT_URI', 'http://localhost:4000/api/auth/callback'),
  SESSION_SECRET: getEnv('SESSION_SECRET', 'fallback_dev_secret_key_change_in_production'),

  // AI & External APIs
  GEMINI_API_KEY: getEnv('GEMINI_API_KEY', ''),
  LASTFM_API_KEY: getEnv('LASTFM_API_KEY', ''),
  LASTFM_USERNAME: getEnv('LASTFM_USERNAME', 'barb_btw'),
  SPOTIFY_CLIENT_ID: getEnv('SPOTIFY_CLIENT_ID', ''),
  SPOTIFY_CLIENT_SECRET: getEnv('SPOTIFY_CLIENT_SECRET', ''),
  SPOTIFY_REDIRECT_URI: getEnv('SPOTIFY_REDIRECT_URI', 'http://localhost:4000/api/spotify/callback'),

  // Storage & Crypto
  get DB_PATH() { return getEnv('DB_PATH', path.resolve(__dirname, '../../clips.db')); },
  get DB_ENCRYPTION_KEY() { return getEnv('DB_ENCRYPTION_KEY', 'fallback_default_dev_key_only_for_local_tests_32byte_string!'); },
  get VAULT_STORAGE_DIR() {
    return getEnv('VAULT_STORAGE_DIR', path.resolve(__dirname, '../../data/vault_blobs'));
  },
  get VAULT_ENCRYPTION_KEY() {
    return getEnv('VAULT_ENCRYPTION_KEY', this.DB_ENCRYPTION_KEY || this.SESSION_SECRET);
  }
};

module.exports = config;
