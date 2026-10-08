---
title: "Media Host Storage Telemetry & Streamlined /system Command"
slug: "media-host-storage-and-system-redesign"
status: "completed"
location: "archive"
phase: "implement"
intake_status: "approved"
spec_review: "approved"
plan_review: "approved"
modules: ["src/bot.js", "src/botEmbeds.js", "src/mediaStorageWatchdog.js", "src/systemStats.js", "src/slashCommands.js"]
files: ["src/bot.js", "src/botEmbeds.js", "src/mediaStorageWatchdog.js", "src/systemStats.js", "src/slashCommands.js", "scripts/lint-quality.mjs"]
tags: ["media-host", "storage-watchdog", "cloudflare-r2", "vps-disk", "system-telemetry", "discord-ui"]
validation_status: "unknown"
created_at: "2026-10-08"
updated_at: "2026-10-08"
---

# Change Summary: Media Host Storage Telemetry & Streamlined /system Command

## Problem & Goals
- The user requested dedicated media host storage pages in the bot to monitor how the media host (`media.asikvestel.org`) is performing in terms of storage for both host VPS NVMe disk and Cloudflare R2 bucket.
- Documentation in `docs/MEDIA_STORAGE_WATCHDOG_AGENT_NOTE.md` and `docs/MEDIA_HOST_STATS_SPEC.md` specifies reading `/var/www/media-host/data/media.db` and host `fs.statfsSync('/')` via `src/mediaStorageWatchdog.js` without fragile external HTTP endpoints.
- The user pointed out that the current `/system` command is too cluttered and requested streamlining it to look significantly better.
- Hook `initMediaStorageWatchdog(client, config)` into `src/bot.js` to enable automatic hourly storage monitoring and admin alert DMs.
- Provide a dedicated `/media-stats` slash command and a dedicated `media` tab in `/system`.

## Scope of Changes
1. **`src/bot.js`**: Hook `initMediaStorageWatchdog(client, config)` on `Events.ClientReady`. Handle `/media-stats` slash command. Update `/system` collector to support `sys_page_media`.
2. **`src/slashCommands.js`**: Register `/media-stats` slash command.
3. **`src/systemStats.js`**: Include `mediaHost` telemetry gathered via `getMediaHostStats(config)`.
4. **`src/botEmbeds.js`**:
   - Redesign `/system` embeds (`vps`, `media`, `web`, `nighty`, `mc`) with clean, modern, uncluttered layouts, inline columns, and visual gauges.
   - Implement `createMediaHostStatsEmbed` for `/media-stats` and `sys_page_media`.
   - Update `createSystemActionRow` with a 2-tier layout: 5 navigation buttons in Row 1 (`vps`, `media`, `web`, `nighty`, `mc`) and Action buttons in Row 2 (`refresh`, `media.asikvestel.org` link, `asikvestel.org` link).
5. **`scripts/lint-quality.mjs`**: Ensure `mediaStorageWatchdog.js` is mapped to Layer 2 (Domain Services & Features).
6. **`tests/`**: Expand `tests/systemStats.test.js` and `tests/botEmbeds.test.js` to cover the new `media` page, `/media-stats` embed, and streamlined ActionRow layout.
