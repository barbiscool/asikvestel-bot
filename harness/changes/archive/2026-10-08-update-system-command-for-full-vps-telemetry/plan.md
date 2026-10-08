# Plan: Full VPS Service Telemetry for /system

## Technical Approach
1. **Collector Enhancements (`src/systemStats.js`)**:
   - Add `readPm2Processes()`: calls `pm2 jlist` (or falls back safely), returning process states for `asikvestel-vault`, `asikvestel-media`, and `asikvestel-bot`.
   - Enhance `readDockerContainers()`: dynamically parses `docker ps` and `docker stats`, mapping:
     - `nighty` (selfbot)
     - `vaultwarden` (password vault)
     - `mcRouter` (Minecraft packet router)
     - `minecraft` (Pterodactyl server)
     - `allContainers` (full container array)
   - Add `readSystemServices()`: checks local listening ports (Nginx, Wings, MariaDB, Redis, Media Host).
   - Bundle domain routing catalog (5 production domains).
2. **Embed Presentation Enhancements (`src/botEmbeds.js`)**:
   - **Page `vps`**: Host OS, CPU, RAM gauge bar, NVMe gauge bar, 5 Nginx domains, security & listening ports.
   - **Page `web`**: PM2 applications (`asikvestel-vault`, `asikvestel-media`, `asikvestel-bot`), memory consumption, SQLite WAL metrics, and live integrations.
   - **Page `nighty`**: Nighty container stats, Vaultwarden container stats, mc-router container stats, and Docker networking.
   - **Page `mc`**: Minecraft Fabric Java 25 status, Pterodactyl Wings daemon (`wings.service`), Panel status, MariaDB, and Redis.
3. **Test Suite Expansion (`tests/systemStats.test.js`)**:
   - Verify new telemetry properties (`vaultwarden`, `mcRouter`, `pm2`, `services`, `domains`).
   - Validate embed rendering across all pages with enriched fields.

## Impacted Modules And Files
- `src/systemStats.js`
- `src/botEmbeds.js`
- `src/slashCommands.js`
- `tests/systemStats.test.js`

## Verification Plan
- Run `npm test` (all tests pass).
- Run `npm run lint:arch` (layer compliance verified).
- Run `npm run lint:harness` (ECL and encoding compliance verified).
