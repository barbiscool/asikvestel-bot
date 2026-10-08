# Tasks: Media Host Storage Telemetry & Streamlined /system Command

## Format
- `- [ ] T001 [P?] [US?] Action with target path and validation note`

## Setup / Intake
- [x] T001 Review `spec.md`, `plan.md`, and media host watchdog architecture notes.

## Implementation
- [x] T002 Move `mediaStorageWatchdog.js` to Layer 2 in `scripts/lint-quality.mjs`.
- [x] T003 Integrate `getMediaHostStats` into `src/systemStats.js` and enrich `getSystemStats()`.
- [x] T004 Implement `createMediaHostStatsEmbed` and streamline all `/system` embeds in `src/botEmbeds.js` (including `media` tab and 2-row ActionRow).
- [x] T005 Register `/media-stats` slash command in `src/slashCommands.js`.
- [x] T006 Hook `initMediaStorageWatchdog(client, config)` and `/media-stats` command handler in `src/bot.js`.
- [x] T007 Update and expand test suites (`tests/systemStats.test.js`, `tests/botEmbeds.test.js`).

## Validation
- [x] T008 Run `npm run verify` (`npm test`, `lint:arch`, `lint:harness`).

## Deferred Tasks
- None.
