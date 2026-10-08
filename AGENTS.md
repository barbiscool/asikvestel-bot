# Aşık Vestel Bot Agent Guide

This file is the project entry map for AI agents working in `asikvestel-bot`.

## 1 Project Snapshot

- **What it is**: Standalone Discord.js bot and media vault ingestion daemon for the Aşık Vestel community.
- **Core workflow**: Listens to Discord WebSocket Gateway events (media uploads, Spotify presence, voice status), processes media into an AES-256-GCM encrypted vault, scrobbles music playback, and bridges chats to the web studio.
- **Runtime shape**: Node.js long-running daemon (CommonJS, Discord.js v14, better-sqlite3) managed in production via PM2.
- **Start here**: [Architecture](docs/ARCHITECTURE.md), [Development](docs/DEVELOPMENT.md), [ECL](docs/ECL.md), [Status](docs/STATUS.md)

## 2 Core Workflow & Domain Model

| Domain Concept | Source Path | What Agents Need To Know |
|---|---|---|
| Bot Client & Lifecycle | [`src/bot.js`](file:///home/barb/gemini/asikvestel-bot/src/bot.js) | Initializes Discord client, event dispatchers, cache sweepers, and user profile sync. |
| Media Vault Ingestion | [`src/vaultWorker.js`](file:///home/barb/gemini/asikvestel-bot/src/vaultWorker.js) | Intercepts clips/GIFs/YouTube, derives AES-256 keys, writes encrypted chunks to disk. |
| Zero-Limit Spotify Scrobbler | [`src/discordSpotifyTracker.js`](file:///home/barb/gemini/asikvestel-bot/src/discordSpotifyTracker.js) | Scans user activity on Discord Gateway; scrobbles track when stopped if duration >= 30s. |
| Voice Channel Accounting | [`src/vcTracker.js`](file:///home/barb/gemini/asikvestel-bot/src/vcTracker.js) | Aggregates user voice session seconds; flushes in-memory sessions cleanly on exit. |
| System Telemetry Panel | [`src/systemStats.js`](file:///home/barb/gemini/asikvestel-bot/src/systemStats.js) | Collects VPS, Web API, Nighty selfbot, and Minecraft metrics for `/sistem`. |
| Web Chat Bridge Relay | [`src/chatBridge.js`](file:///home/barb/gemini/asikvestel-bot/src/chatBridge.js) | Relays Discord messages to website SSE endpoint with secret authentication. |
| Slash Command Dispatcher | [`src/slashCommands.js`](file:///home/barb/gemini/asikvestel-bot/src/slashCommands.js) | Registers REST v10 guild commands and dispatches interaction execute handlers. |
| SQLite Storage Engine | [`src/db.js`](file:///home/barb/gemini/asikvestel-bot/src/db.js) | Better-sqlite3 queries in WAL mode; shared with sister website studio. |

## 3 Where To Work

| Task Type | Directory / Target | Key Reference |
|---|---|---|
| Media & Vault Processing | `src/vaultWorker.js`, `src/vaultStorage.js` | [Architecture §2.2](docs/ARCHITECTURE.md#22-media--vault-pipeline) |
| Gateway Events & Commands | `src/bot.js`, `src/slashCommands.js` | [Architecture §2.1](docs/ARCHITECTURE.md#21-discord-gateway-pipeline) |
| Presence & Scrobbling | `src/discordSpotifyTracker.js` | [Architecture §2.3](docs/ARCHITECTURE.md#23-spotify-scrobbler) |
| Database & Encryption | `src/db.js`, `src/crypto.js` | [Architecture §3](docs/ARCHITECTURE.md#3-storage--encryption) |
| System Telemetry & Embeds | `src/systemStats.js`, `src/botEmbeds.js` | [Development §4](docs/DEVELOPMENT.md#4-testing--verification) |
| Tests & Regressions | `tests/*.test.js` | [Development §2](docs/DEVELOPMENT.md#2-test-suite) |

## 4 Context Loading Priority

1. Read this guide (`AGENTS.md`).
2. Read [ECL Guide](docs/ECL.md) for change management, intake review, and review gates.
3. If `harness/changes/active/summary.md` exists, load active change `summary.md`, `spec.md`, `plan.md`, `tasks.md`, and `reviews/` before task docs.
4. If no active change exists and `harness/evolution/pending.md` exists, read it as pending maintenance and ask the user whether to handle it.
5. If no active change and no pending evolution exist, read [Status](docs/STATUS.md) for the latest handoff state.
6. Read task-specific docs in `docs/` and inspect related source files.
7. For structured changes (>2 files, API changes, database schema, or architectural changes), run `scripts/harness-change.sh new "<title>"` before writing code.

## 5 Development Commands

```bash
# Run all unit tests (18 tests passing)
npm test

# Run a specific targeted test suite
node --test tests/vaultStorage.test.js

# Run architecture layer & dependency linter
npm run lint:arch

# Run ECL harness and encoding integrity checks
npm run lint:harness

# Start bot in local development mode
npm start

# Manage production PM2 daemon
pm2 start ecosystem.config.js
pm2 logs asikvestel-bot
pm2 restart asikvestel-bot
```

## 6 Verification Matrix

| Change Type | Minimum Verification Command |
|---|---|
| Bot Logic & Modules | `npm test` (all 18 unit tests must pass) |
| Architecture & Layering | `npm run lint:arch` |
| Harness & Documentation | `npm run lint:harness` |
| Production Daemon | `pm2 restart asikvestel-bot && pm2 logs asikvestel-bot` |

## 7 Safety Boundaries

- **Database Integrity**: Never drop tables or delete `/var/lib/asikvestel/clips.db`. It is shared with the production web studio.
- **Graceful Shutdown**: Always call `flushActiveVoiceSessions()` and close open statements before exiting.
- **Secrets Protection**: Never commit bot tokens, API keys, or `.env` files. Keep `.gitignore` intact.
- **ECL State Protection**: Active change files override `docs/STATUS.md`. Never hand-edit `harness/changes/INDEX.json`.
