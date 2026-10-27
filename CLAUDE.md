# bot

Discord bot for Aşık Vestel. Shared context (services, VPS, deploys, data rules) is in `../CLAUDE.md`; this file covers this repo and the Claude Code tooling installed for it.

## Testing

- Tests need **Node 20** (what the VPS runs). `better-sqlite3` 11 doesn't build on newer local Node, and `db.js` has no fallback driver, so `npm test` on Node 26 fails the DB tests (see Habits for how to run on Node 20).
- `node --test` sets `NODE_TEST_CONTEXT`; `src/config.js` then skips `.env`, so tests never see the live token or the real DB path. Keep it that way.

## Shared modules

`crypto.js`, `vaultStorage.js`, `vaultWorker.js`, `chatBridge.js`, `parser.js`, `discordSpotifyTracker.js`, `cdnRefresher.js`, `dynamicDataDefaults.js` and `db.js` must be byte-identical to `../website/backend/src/`. The bot has no `statsSync.js` (the website writes `stats.json`). `db.js` holds the queries of both apps (the bot's voice and user-sync ones, the website's sessions and Wrapped ones), so unused functions on either side are expected. The Website session leads changes to these: agree first, then copy its file unchanged and check the sha256.

## Tooling

| Tool | Use it for | How |
| --- | --- | --- |
| **ponytail** plugin (enabled for this repo) | Smallest working change; always on | `/ponytail-help` lists modes; `/ponytail-review` for a change, `/ponytail-audit` for the repo |
| **claude-context** MCP | Semantic code search across bot, website and media-host | `search_code` with an absolute `path`, e.g. `/home/barb/Projects/claude-coding/netcup-vps/website` for the chat bridge or the shared modules. No query prefix needed |
| **graphify** skill | Map a codebase into a knowledge graph | `/graphify` |
| **antigravity** plugin (agy / Gemini) | Delegating bulk work, a second-model review, web research | `/antigravity:delegate`, `/antigravity:review`, `/antigravity:research` |

### claude-context rules

- **Search freely.** `search_code` is unlimited and costs well under a cent per 1,000 queries; use it first for any "where is the code that does X" question, and grep only for exact strings. The cost and rate-limit notes below are about indexing only.
- All three repos are already indexed, and background sync picks up changed files. Don't re-index.
- A guard hook allows at most 6 `index_codebase`/`clear_index` calls per hour across all sessions, because embeddings cost money (Gemini `gemini-embedding-001`, paid key, monthly cap). Never re-index in a loop.
- `get_indexing_status` can show a bogus "200 files / 200 chunks" mid-run; trust the final status.
- Vectors live in local Milvus in Docker (`~/milvus`), started and stopped by a SessionStart/SessionEnd hook.
- Don't switch to `gemini-embedding-2`; it doesn't work with claude-context 0.1.15.

### antigravity rules

- Anything sent to it goes to Google.
- The user considers Gemini-written code poor: verify everything it returns.
- Get the user's OK before letting it write files (`--yolo`).

## Guardrails

- `ssh`, `scp`, `./deploy.sh` and `bash deploy.sh` always ask the user first.
- A PostToolUse hook (`~/.claude/hooks/netcup-twin-modules.sh`) warns when an edited shared module differs from its website twin, `db.js` included.
- `gh` isn't installed: no PRs. Push only with the user's OK.

## Code map (`src/`)

Entry: `index.js` (init DB, check `DISCORD_BOT_TOKEN` and `DB_ENCRYPTION_KEY`, login, SIGINT/SIGTERM flush) -> `bot.js` `createBotClient`. PM2 app `asikvestel-bot` (`ecosystem.config.js`, 350M restart limit).

| Module | Role |
| --- | --- |
| `bot.js` | Discord events (`messageCreate`, `messageReactionAdd`, `interactionCreate`, `guildMemberUpdate`, `guildCreate`), `encryptToVault`, wires everything below |
| `slashCommands.js` | `/resim-ekle`, `/clip`, `/sync-gecmis`, `/arsiv-durum`, `/system`, `/media-stats`, `/soz-ekle`, `/feature`, `/oyun-ekle`; `deploySlashCommands` (also run on `guildCreate`) |
| `botEmbeds.js` | All embed/row builders (clips, images, stats, system, alerts). `/system` has 5 pages: `vps` (overview + top RAM users), `media`, `web` (PM2 apps), `docker` (every container), `services` (everything else, from `systemStats.processGroups`) |
| `systemStats.js`, `mediaStorageWatchdog.js` | Admin-only host stats. `processGroups` buckets every process by cgroup (container, PM2 app, systemd unit, SSH session) with Turkish display names (`UNIT_LABELS`, `PM2_LABELS`, `containerLabel`); add a name there when a new service appears on the VPS. Docker/PM2/systemd and media-host disk alerts; the watchdog reads `MEDIA_DB_PATH` read-only |
| `vcTracker.js` | Voice-channel time tracking; `flushActiveVoiceSessions` runs on shutdown |
| `backfill.js` | Throttled history backfill, run by `/sync-gecmis` (clips only, no vault copy) |
| `vaultQueue.js` | Small queue: at most 2 vault copies at once, 50 waiting, so a burst can't push the bot past PM2's 350M limit. Failed copies retry twice; older blobless rows are only fixed by `node src/vaultWorker.js --migrate` (nothing on the VPS runs it on a schedule) |
| `config.js` | Env loading; skips `.env` under `node --test`. Falls back to a public dev key, so `index.js` refuses to start without `DB_ENCRYPTION_KEY` |
| Shared (see above) | `db.js` (1.5k lines, schema + queries), `chatBridge.js`, `parser.js`, `vaultWorker.js`, `vaultStorage.js`, `crypto.js`, `cdnRefresher.js`, `discordSpotifyTracker.js`, `dynamicDataDefaults.js` |

## Habits

- Before deleting an export, grep `src/` and `tests/`; some exports exist only for tests (e.g. `botEmbeds.createSystemEmbed`, `systemStats.readDockerContainers`).
- Local Node is 26, but `node_modules/better-sqlite3` is built for Node 20 (ABI 115) and v11 won't compile on 26, so 8 DB tests fail there with `ERR_DLOPEN_FAILED`. A persistent Node 20.20.2 is installed: put it first on `PATH` for `npm test` and `./deploy.sh` (`PATH=$HOME/.local/share/node20/node_modules/node/bin:$PATH`), or run `~/.local/bin/node20 --test tests/*.test.js`. Don't reinstall it into `/tmp` (wiped on reboot).
- Local `.env` exists and is gitignored; never print it.
