# Tasks: Full VPS Service Telemetry for /system

## Format
- `- [ ] T001 [P?] [US?] Action with target path and validation note`

## Setup / Intake
- [x] T001 Review `spec.md` and `plan.md` gates before implementation.

## Implementation
- [x] T002 Implement `readPm2Processes()`, dynamic `readDockerContainers()`, and `readSystemServices()` in `src/systemStats.js`.
- [x] T003 Update embed builders in `src/botEmbeds.js` to render all VPS services across `vps`, `web`, `nighty`, and `mc` pages.
- [x] T004 Update slash command description in `src/slashCommands.js`.
- [x] T005 Expand unit test assertions in `tests/systemStats.test.js` to validate new telemetry sections.

## Validation
- [x] T006 Run `npm run verify` (`npm test`, `lint:arch`, `lint:harness`).

## Deferred Tasks
- None.
