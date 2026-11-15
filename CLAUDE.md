# bot

Discord bot for Aşık Vestel. Shared context (services, VPS, deploys, data rules) is in `../CLAUDE.md`; this file covers this repo. Tool rules (claude-context, graphify, agy, ponytail) are in `~/.claude/CLAUDE.md` and are not repeated here.

## Testing

- Tests need **Node 20** (what the VPS runs). `better-sqlite3` 11 doesn't build on newer local Node, and `db.js` has no fallback driver, so `npm test` on Node 26 fails the DB tests (see Habits for how to run on Node 20).
- `node --test` sets `NODE_TEST_CONTEXT`; `src/config.js` then skips `.env`, so tests never see the live token or the real DB path. Keep it that way.

## Shared modules

`crypto.js`, `vaultStorage.js`, `vaultWorker.js`, `chatBridge.js`, `parser.js`, `discordSpotifyTracker.js`, `cdnRefresher.js`, `dynamicDataDefaults.js` and `db.js` must be byte-identical to `../website/backend/src/`. The bot has no `statsSync.js` (the website writes `stats.json`). `db.js` holds the queries of both apps (the bot's voice and user-sync ones, the website's sessions and Wrapped ones), so unused functions on either side are expected. The Website session leads changes to these: agree first, then copy its file unchanged and check the sha256.

## Guardrails

- `ssh`, `scp`, `./deploy.sh` and `bash deploy.sh` always ask the user first.
- A PostToolUse hook (`~/.claude/hooks/netcup-twin-modules.sh`) warns when an edited shared module differs from its website twin, `db.js` included.
- No PRs (see `../CLAUDE.md`). Push only with the user's OK.

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
