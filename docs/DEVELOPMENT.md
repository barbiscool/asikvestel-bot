# Development & Operations Guide

> Sources: [`package.json:1-20`](file:///home/barb/gemini/asikvestel-bot/package.json), [`ecosystem.config.js:1-16`](file:///home/barb/gemini/asikvestel-bot/ecosystem.config.js), [`.env.example:1-40`](file:///home/barb/gemini/asikvestel-bot/.env.example)

## 1 Prerequisites & Environment Setup

- **Runtime**: Node.js `>=20.0.0` (LTS recommended, active version `v26.10.0`).
- **Package Manager**: npm.
- **System Packages**: SQLite 3, PM2 (for daemon execution).

```bash
# Clone and enter directory
cd /home/barb/gemini/asikvestel-bot

# Install dependencies
npm install

# Copy configuration template
cp .env.example .env
nano .env
```

## 2 Environment Variables

Key settings in `.env`:

| Variable | Description | Example / Default |
|---|---|---|
| `DISCORD_BOT_TOKEN` | Discord Bot Token | Required secret |
| `DISCORD_CLIENT_ID` | Application Client ID | `1389232967271972914` |
| `DISCORD_GUILD_ID` | Monitored Guild ID(s) | `1389232967271972914,1061058726137692332` |
| `DB_PATH` | Path to SQLite database | `/var/lib/asikvestel/clips.db` |
| `VAULT_STORAGE_PATH` | Encrypted media blob directory | `/var/lib/asikvestel/vault` |
| `VAULT_SECRET_KEY` | 64-hex AES-256 vault secret | Required 64-hex string |
| `DB_ENCRYPTION_KEY` | 64-hex SQLite encryption key | Required 64-hex string |
| `WEB_API_URL` | Sister website API relay | `http://localhost:4000` |
| `CHAT_BRIDGE_INTERNAL_SECRET` | Webhook relay authentication secret | Shared secret string |

## 3 Commands Reference

```bash
# Run unit test suite
npm test

# Run targeted test file
node --test tests/crypto.test.js

# Run architecture layer validation
npm run lint:arch

# Run ECL harness and encoding checks
npm run lint:harness

# Start bot in development mode (attached)
npm start

# Manage production PM2 daemon
pm2 start ecosystem.config.js
pm2 status
pm2 logs asikvestel-bot
pm2 restart asikvestel-bot
```

## 4 Testing & Verification

The bot includes 18 unit tests using Node.js's native test runner (`node:test`):

| Test Suite | File | Covers |
|---|---|---|
| Bot Embeds | `tests/botEmbeds.test.js` | Media embeds, system telemetry panels, button rows |
| Cryptography | `tests/crypto.test.js` | AES-256-GCM encryption, decryption, tamper resistance |
| Spotify Scrobbler | `tests/discordSpotifyTracker.test.js` | Gateway presence events, >=30s scrobble trigger |
| Game & Media Parser | `tests/parser.test.js` | Game tag regex, emoji normalization, video extraction |
| Stats Synchronization | `tests/statsSync.test.js` | Public stats JSON output and aggregates |
| System Telemetry | `tests/systemStats.test.js` | Metrics parsing, admin authorization, latency pings |
| Vault Storage | `tests/vaultStorage.test.js` | Encrypted file streams, path traversal defenses |
| Voice Channel Accounting | `tests/vcTracker.test.js` | Voice join/leave durations and session flush |

## 5 Production Deployment

The bot runs on the production VPS (`root@62.83.32.164`) under PM2:

```bash
# On production VPS:
cd /var/www/asikvestel-bot
git pull origin main
npm install --omit=dev
pm2 restart ecosystem.config.js
pm2 logs asikvestel-bot --lines 50
```
