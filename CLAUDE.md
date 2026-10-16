# bot

Discord bot for Aşık Vestel. Shared context (services, VPS, deploys, data rules) is in `../CLAUDE.md`; this file covers this repo and the Claude Code tooling installed for it.

## Testing

- Tests need **Node 20** (what the VPS runs). `better-sqlite3` 11 doesn't build on newer local Node, and `db.js` has no fallback driver, so `npm test` on Node 26 fails the DB tests.
- `node --test` sets `NODE_TEST_CONTEXT`; `src/config.js` then skips `.env`, so tests never see the live token or the real DB path. Keep it that way.

## Shared modules

`crypto.js`, `vaultStorage.js`, `vaultWorker.js`, `chatBridge.js`, `parser.js`, `discordSpotifyTracker.js`, `cdnRefresher.js`, `dynamicDataDefaults.js` and `db.js` must be byte-identical to `../website/backend/src/`. The bot has no `statsSync.js` (the website writes `stats.json`). The Website session leads changes to these: agree first, then copy its file unchanged and check the sha256.

## Tooling

| Tool | Use it for | How |
| --- | --- | --- |
| **ponytail** plugin (enabled for this repo) | Smallest working change; always on | `/ponytail-help` lists modes; `/ponytail-review` for a change, `/ponytail-audit` for the repo |
| **claude-context** MCP | Semantic code search across bot, website and media-host | `search_code` with an absolute `path`, e.g. `/home/barb/Projects/claude-coding/netcup-vps/website` for the chat bridge or the shared modules. No query prefix needed |
| **graphify** skill | Map a codebase into a knowledge graph | `/graphify` |
| **antigravity** plugin (agy / Gemini) | Delegating bulk work, a second-model review, web research | `/antigravity:delegate`, `/antigravity:review`, `/antigravity:research` |

### claude-context rules

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
- A PostToolUse hook warns when an edited shared module differs from its website twin. Its list still names `statsSync.js` and doesn't include `db.js`, so check `db.js` by hand (`cmp src/db.js ../website/backend/src/db.js`).
- `gh` isn't installed: no PRs. Push only with the user's OK.
