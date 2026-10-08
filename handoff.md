# Session Handoff: Aşık Vestel Discord Bot (asikvestel-bot)

**Date:** 2026-10-08  
**Branch:** `main` (synchronized with `origin/main` at `git@github.com:barbiscool/asikvestel-bot.git`)  
**Status:** Clean working tree, 18/18 tests passing, standalone production-ready.  
**Sister Repository:** [`AV-WEBSITE-STUDIO`](file:///home/barb/gemini/AV-WEBSITE-STUDIO) (`git@github.com:barbiscool/av-website-2.git`)

---

## 1. Project Overview & Architecture

`asikvestel-bot` is the dedicated, standalone Discord bot and media ingestion daemon for the **Aşık Vestel** community. It separated from the monolithic web studio repository on 2026-10-08.

- **Engine:** Discord.js v14 (`Client`, `GatewayIntentBits`) connecting directly to the Discord WebSocket Gateway.
- **Runtime:** Node.js long-running daemon managed by PM2 (`ecosystem.config.js`).
- **Core Responsibilities:**
  1. **Media & Clip Vault Ingestion:** Automatically intercepts video uploads, Tenor/Klipy GIFs, YouTube links, and custom commands (`/clip`, `/resim-ekle`) and archives them into an AES-256-GCM encrypted local vault.
  2. **Zero-Limit Spotify Presence Tracking:** Listens to Discord user presences in real-time across guilds and scrobbles songs to SQLite when a user finishes playing (duration >= 30s).
  3. **Voice Channel Duration Tracking:** Monitors voice state joins, leaves, and guild switches, persisting accurate aggregated voice durations without blocking SQLite transactions.
  4. **System Telemetry Panel (`/sistem`):** Real-time monitoring of host VPS resources (CPU, RAM, Disk, Uptime), Web API latency, Nighty selfbot status, and Minecraft server ping with interactive Discord ActionRow buttons.
  5. **Web-to-Discord Chat Bridge:** Receives Discord channel messages and relays them to the website's SSE endpoint via an internal HTTP webhook.
  6. **Slash Commands:** Deploys and handles guild slash commands with Discord.js REST v10.

---

## 2. Infrastructure & Server Topology

| Role | Host / Address | State | Key Services & Paths |
| :--- | :--- | :--- | :--- |
| **Production VPS** | `root@62.83.32.164` | **ONLINE (Active)** | - PM2 Service: `asikvestel-bot`<br>- Bot Root: `/var/www/asikvestel-bot/`<br>- Shared Database: `/var/lib/asikvestel/clips.db`<br>- Encrypted Vault: `/var/lib/asikvestel/vault/` (or `/data/vault_blobs/`) |
| **Local Bot Workspace** | `/home/barb/gemini/asikvestel-bot` | **Clean (`main`)** | - Git Remote: `git@github.com:barbiscool/asikvestel-bot.git`<br>- Tests: `tests/*.test.js` (18 passing) |
| **Sister Web Workspace** | `/home/barb/gemini/AV-WEBSITE-STUDIO` | **Clean (`main`)** | - Git Remote: `git@github.com:barbiscool/av-website-2.git`<br>- Web API & Studio Frontend |

---

## 3. Key File Map & Critical Modules

```
asikvestel-bot/
├── .env.example                 # Template for required environment variables
├── .gitignore                   # Excludes node_modules, .env, *.db, logs, temp
├── ecosystem.config.js          # PM2 production configuration
├── package.json                 # Dependencies (discord.js, better-sqlite3, dotenv)
├── README.md                    # Project overview & quickstart guide
├── handoff.md                   # This detailed handoff documentation
├── src/
│   ├── index.js                 # Standalone entry point & graceful shutdown handler
│   ├── bot.js                   # Client initialization, event listeners & sweepers
│   ├── botEmbeds.js             # Rich Discord embeds & ActionRow button builders
│   ├── slashCommands.js         # Slash command definitions & REST deployment
│   ├── discordSpotifyTracker.js # Real-time Gateway Spotify presence listener
│   ├── vcTracker.js             # Voice channel duration tracker & flush engine
│   ├── systemStats.js           # Host telemetry, VPS/Nighty/Minecraft metrics
│   ├── parser.js                # Game tag regex, emoji mapping & media extractor
│   ├── chatBridge.js            # Web-to-Discord chat bridge & relay emitter
│   ├── vaultStorage.js          # AES-256-GCM cipher engine with key derivation
│   ├── vaultWorker.js           # Media downloader with SSRF & memory limits
│   ├── cdnRefresher.js          # Discord CDN URL refresher
│   ├── crypto.js                # AES-256-GCM helper functions
│   ├── db.js                    # SQLite database layer & prepared queries
│   ├── config.js                # Environment variable reader
│   ├── statsSync.js             # Syncs public stats JSON
│   ├── backfill.js              # Historical channel backfill utility
│   ├── scanNewServer.js         # Full guild history scanner
│   ├── scanMediaAndGifs.js      # GIF & media channel bulk scanner
│   └── dynamicDataDefaults.js   # Seed constants for SQLite
└── tests/
    ├── botEmbeds.test.js        # Tests for embeds, action rows & telemetry formatters
    ├── crypto.test.js           # Tests for AES-256-GCM encryption & tamper resistance
    ├── discordSpotifyTracker.test.js # Tests for presence parsing & track scrobbling
    ├── parser.test.js           # Tests for game tags & media URL extraction
    ├── statsSync.test.js        # Tests for stats calculation
    ├── systemStats.test.js      # Tests for metrics collection & authorization
    ├── vaultStorage.test.js     # Tests for encrypted blob read/write lifecycle
    └── vcTracker.test.js        # Tests for voice duration accounting & sessions
```

---

## 4. Canonical Commands for Incoming Agents

| Task | Command | Description |
| :--- | :--- | :--- |
| **Run All Bot Tests** | `npm test` | Runs the 18 bot test suites using Node test runner. |
| **Run Specific Test** | `node --test tests/<name>.test.js` | Runs a targeted test suite. |
| **Start Bot (Development)** | `node src/index.js` or `npm start` | Boots the bot with live console logs. |
| **Deploy / Start with PM2** | `pm2 start ecosystem.config.js` | Starts the bot as a background daemon. |
| **View PM2 Logs** | `pm2 logs asikvestel-bot` | Streams live bot output and error logs. |
| **Restart Bot Daemon** | `pm2 restart asikvestel-bot` | Restarts the bot process cleanly. |

---

## 5. Integration with the Web Studio (`AV-WEBSITE-STUDIO`)

### A. Shared SQLite Database (`clips.db`)
- Both services connect to the same SQLite database (`/var/lib/asikvestel/clips.db`).
- SQLite's **WAL (Write-Ahead Logging)** mode allows the bot to write new clips, voice stats, and scrobbles without locking out the web API from reading them.

### B. Live Chat Bridge Relay
1. When a user sends a message on the website, the web API uses the Discord Webhook directly.
2. When a user sends a message in the Discord channel, `bot.js` calls `chatBridge.handleIncomingMessage(message)`.
3. If `WEB_API_URL` is set in `.env` (e.g. `http://localhost:4000`), `chatBridge.js` forwards the message via HTTP POST to:
   ```
   POST http://localhost:4000/api/chat/internal/incoming
   Headers:
     Content-Type: application/json
     x-internal-secret: <CHAT_BRIDGE_INTERNAL_SECRET>
   Body:
     { "message": { ... } }
   ```
4. The web server immediately broadcasts it to all connected web clients via Server-Sent Events (SSE).

---

## 6. Environment Variables (`.env`) Reference

```ini
# Discord Bot Credentials
DISCORD_BOT_TOKEN="your_bot_token"
DISCORD_CLIENT_ID="your_client_id"
DISCORD_CLIENT_SECRET="your_client_secret"

# Guild IDs
DISCORD_GUILD_ID="1389232967271972914,1061058726137692332"
AUTH_GUILD_ID="1389232967271972914"
AV2_GUILD_ID="1061058726137692332"

# Monitored Channels
CLIPS_CHANNEL_IDS="1508809916905685224,1389232968140062823"
MEDIA_SCAN_CHANNEL_IDS="1508809916905685224,1389232968140062823,1210949927702757447,1072955073421901834"

# Chat Channels & Web Relay
DISCORD_CHAT_CHANNEL_ID="1072955073421901834"
CHAT_CHANNEL_ISTANBUL_ID="1072955073421901834"
CHAT_CHANNEL_ANKARA_ID="1389232968140062823"
WEB_API_URL="http://localhost:4000"
CHAT_BRIDGE_INTERNAL_SECRET="your_shared_secret"

# Paths & Security
DB_PATH="/var/lib/asikvestel/clips.db"
VAULT_STORAGE_PATH="/var/lib/asikvestel/vault"
VAULT_SECRET_KEY="64_hex_characters"
DB_ENCRYPTION_KEY="64_hex_characters"
NODE_ENV="production"
ADMIN_DISCORD_IDS="735152588801966132"
```

---

## 7. Mandatory Agent Rules & Conventions

1. **Universal Skill Advisor Protocol:**
   - Execute `~/.agents/find_skill.py -p "<user prompt>"` on Turn 1 before making changes.
2. **Database Integrity:**
   - Do not overwrite production database tables. Never delete `/var/lib/asikvestel/clips.db`.
3. **Graceful State Management:**
   - In-flight voice sessions (`vcTracker`) and batched user upserts must be flushed before terminating (`flushActiveVoiceSessions()`).
4. **Secret Protection:**
   - Never commit `.env` or bot tokens. Use `.gitignore` strictly.
5. **Verification Before Completion:**
   - Run `npm test` (all 18 tests must pass) before claiming tasks are complete.
