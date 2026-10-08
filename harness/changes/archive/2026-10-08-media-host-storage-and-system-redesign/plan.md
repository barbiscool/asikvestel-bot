# Plan: Media Host Storage Telemetry & Streamlined /system Command

## Technical Approach
1. **Layer Classification (`scripts/lint-quality.mjs`)**:
   - Place `mediaStorageWatchdog.js` in Layer 2 (Domain Services & Features). It only imports `botEmbeds.js` (Layer 2) and core modules, behaving identically to `vcTracker.js` and `discordSpotifyTracker.js`.
2. **Telemetry Aggregator (`src/systemStats.js`)**:
   - Import `getMediaHostStats` from `./mediaStorageWatchdog`.
   - Incorporate `mediaHost: getMediaHostStats(config)` into `getSystemStats()`.
3. **Embed Streamlining & Media Host Embeds (`src/botEmbeds.js`)**:
   - Add `createMediaHostStatsEmbed({ stats, config })`.
   - Redesign `createSystemPageEmbed`:
     - Clean up `vps`: inline CPU, RAM gauge, NVMe gauge, and clean 5-domain status block.
     - Add `media`: R2 gauge bar, VPS disk gauge bar, registered members & invites, SQLite status, and direct web links.
     - Clean up `web`: 3 PM2 apps with status badges, memory consumption, SQLite WAL stats, live integrations.
     - Clean up `nighty`: Nighty, Vaultwarden, mc-router with status indicators, CPU/RAM stats, clean proxy info.
     - Clean up `mc`: Minecraft Fabric, Pterodactyl Wings, MariaDB, Redis, direct server IP.
   - Update `createSystemActionRow(activePage, disabled)`:
     - Row 1: `sys_page_vps`, `sys_page_media`, `sys_page_web`, `sys_page_nighty`, `sys_page_mc`.
     - Row 2: `sys_page_refresh` (+ optional site link button).
4. **Bot Startup & Command Handling (`src/bot.js`, `src/slashCommands.js`)**:
   - In `src/slashCommands.js`: register `/media-stats`.
   - In `src/bot.js`:
     - Call `initMediaStorageWatchdog(client, config)` in `Events.ClientReady`.
     - Handle `interaction.commandName === 'media-stats'` with interactive refresh collector.
     - Update `/system` collector to handle `sys_page_media`.
5. **Testing & Verification**:
   - Update `tests/systemStats.test.js` to assert `media` page and new ActionRow structure.
   - Update `tests/botEmbeds.test.js` to assert `createMediaHostStatsEmbed`.
   - Run `npm run verify` (`npm test`, `npm run lint:arch`, `npm run lint:harness`).
