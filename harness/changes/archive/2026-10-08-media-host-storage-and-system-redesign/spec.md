# Spec: Media Host Storage Telemetry & Streamlined /system Command

## Intake Review
- Intake type: Structured Change
- Input shape: User request ("where are the pages for the media host? I want to see how the media host is doing in terms of storage for both the vps disk and r2... Also streamline the /system command to just look better. it's way too cluttered.")
- Source documents:
  - `docs/MEDIA_STORAGE_WATCHDOG_AGENT_NOTE.md`
  - `docs/MEDIA_HOST_STATS_SPEC.md`

## Goal And Evidence
- **Real problem**:
  1. The bot lacked presentation of media host storage metrics (R2 bucket usage, NVMe host disk allocation, registered users, and active invites) in the Discord UI.
  2. The `/system` command embed was dense, noisy, and visually cluttered.
  3. `initMediaStorageWatchdog` in `src/mediaStorageWatchdog.js` was implemented but not hooked into `src/bot.js` startup.
- **Success Criteria**:
  1. `/media-stats` slash command displays media host metrics with interactive refresh.
  2. `/system` command features a dedicated `☁️ Medya` tab (`sys_page_media`) alongside `vps`, `web`, `nighty`, and `mc`.
  3. All `/system` embed pages redesigned with clean aesthetic presentation, inline columns, and visual gauges.
  4. `initMediaStorageWatchdog(client, config)` runs automatically when the bot is ready.
  5. 100% test pass rate (`npm run verify`).

## User Scenarios
- **Scenario 1**: Admin runs `/media-stats` in Discord. Bot displays a modern embed showing R2 usage vs 10 GB free tier cap, VPS NVMe disk space, user count, active invite tokens, and a refresh button.
- **Scenario 2**: Admin runs `/system` and navigates across the 5 clean tabs: `🖥️ VPS`, `☁️ Medya`, `🌐 Web & Bot`, `🤖 Docker`, `⛏️ Minecraft`. Each page presents uncluttered, easily scannable metrics.
- **Scenario 3**: Storage reaches critical threshold (R2 > 8.5 GB or VPS free disk < 10%). Watchdog dispatches an alert DM to `@imbarb`.

## Constraints & Non-Goals
- Read-only direct SQLite and filesystem queries (no remote HTTP routes required).
- Adhere strictly to 5-layer architectural hierarchy in `src/`.
- Maintain Discord rate limits and button count constraints (max 5 buttons per row).
