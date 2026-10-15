# CLAUDE.md — Aşık Vestel Discord Bot (`asikvestel-bot`)

Guidance and operational context for Claude Code working on the standalone Discord bot.

---

## 1. Project Overview

`asikvestel-bot` is the standalone Discord.js daemon and media vault ingestion engine for the Aşık Vestel community.

- **Discord Client:** Discord.js v14 (Node.js CommonJS).
- **Bot Identity:** `asik vestel#1862` (Bot User ID: `1548341215630589952`).
- **Primary Guilds:** `1389232967271972914` and `1061058726137692332`.
- **Production Host:** Ubuntu VPS (`root@62.83.32.164`), deployed to `/var/www/asikvestel-bot/`.
- **Process Manager:** PM2 cluster/fork daemon under the name `asikvestel-bot` (PM2 ID: `2`).
- **Decoupling History:** Decoupled on 2026-10-08 from `AV-WEBSITE-STUDIO/backend` into its own isolated repository to prevent monolith crashes.

---

## 2. Core Subsystems & Key Files

| Module | File | Responsibilities |
| :--- | :--- | :--- |
| **Client Lifecycle** | `src/bot.js` | Discord client setup, ready/clientReady handler, slash command registration, interaction dispatcher. |
| **Slash Commands** | `src/slashCommands.js` | REST v10 guild command registration, definitions for 10 commands including `/system`, `/media-stats`. |
| **Embed Builder** | `src/botEmbeds.js` | Rich embeds for `/system` (5 pages: VPS, Media, Web, Nighty, MC) and `/media-stats`. |
| **Storage Watchdog** | `src/mediaStorageWatchdog.js` | Inspects `/var/lib/asikvestel/media.db` (+WAL/SHM), monitors R2 & VPS disk, sends admin threshold alert DMs. |
| **System Telemetry** | `src/systemStats.js` | Gathers VPS CPU/RAM, PM2 process metrics, Docker container states (`nighty`, `vaultwarden`, `minecraft`), SQLite stats. |
| **Media Ingestion** | `src/vaultWorker.js` | Scans Discord channels for clips/GIFs/YouTube, encrypts via `vaultStorage.js`. |
| **Vault Storage** | `src/vaultStorage.js` | AES-256-GCM chunked file encryption/decryption with key derivation and path traversal protection. |
| **Spotify Tracker** | `src/discordSpotifyTracker.js` | Presence scanner on Discord Gateway; scrobbles stopped tracks to SQLite if duration >= 30s. |
| **Voice Tracker** | `src/vcTracker.js` | Voice channel session aggregator; clean in-memory flush on bot exit. |
| **Chat Bridge Relay** | `src/chatBridge.js` | Relays Discord chat messages to website SSE endpoint (`/api/chat/internal/incoming`). |
| **Database Access** | `src/db.js` | SQLite DAL using `better-sqlite3` in WAL mode for `/var/lib/asikvestel/clips.db`. |

---

## 3. Important Implementation Gotchas

1. **SQLite Driver Incompatibility (`node:sqlite` vs `better-sqlite3`):**
   - Local dev (Node v26) has native `node:sqlite` (`readOnly: true`).
   - Production VPS (Node v20.20.2) uses `better-sqlite3` (`readonly: true, fileMustExist: true`).
   - Always use `openDatabaseReadOnly(dbPath)` in `src/mediaStorageWatchdog.js` to avoid casing errors.
2. **SQLite ISO-8601 Timestamps:**
   - Always use `datetime(expires_at) > datetime('now')` in SQLite queries instead of `expires_at > CURRENT_TIMESTAMP` to handle JavaScript ISO strings containing `'T'` and `'Z'`.
3. **Database Paths:**
   - Production Clips DB: `/var/lib/asikvestel/clips.db`
   - Production Media Host DB: `/var/lib/asikvestel/media.db`
4. **WAL Mode Accounting:**
   - When checking SQLite database size on disk, always sum `${dbPath}`, `${dbPath}-wal`, and `${dbPath}-shm`.

---

## 4. Canonical Commands

Run from `asikvestel-bot/`:

```bash
# Run unit tests (23 tests passing)
npm test

# Run single targeted test
node --test tests/systemStats.test.js

# Run full harness verification (tests, architecture layer lint, ECL checks)
npm run verify

# Deploy to live VPS
bash scripts/deploy.sh
```

---

## 5. Deployment Procedure (`scripts/deploy.sh`)

The deployment script executes:
1. `npm run verify` (local unit tests, arch lint, harness check).
2. `rsync` to `root@62.83.32.164:/var/www/asikvestel-bot/` (excluding git, tests, node_modules).
3. Remote `npm install --omit=dev`.
4. Remote `pm2 reload asikvestel-bot --update-env`.
5. Remote `pm2 save`.
