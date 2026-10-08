# Spec: Full VPS Service Telemetry for /system

## Intake Review
- Intake type: Structured Change
- Input shape: requirement-first ("update /system to include everything running on the vps properly")
- Questions asked this round: 0

## Goal And Evidence
- **Real problem / user request**: The `/system` command previously omitted several services actively running on production VPS `62.83.32.164`, specifically:
  - `vaultwarden` container (`vault.asikvestel.org`, port 8090)
  - `mc-router` container (port 25565)
  - `asikvestel-media` CDN host (`media.asikvestel.org`, port 4500)
  - Actual Pterodactyl Minecraft container running Java 25 on port 25566
  - Pterodactyl Wings daemon (`wings.service`, port 8080/2022)
  - MariaDB (port 3306) & Redis (port 6379)
  - Nginx 5-domain mapping (`asikvestel.org`, `media`, `nighty`, `panel`, `vault`)
- **Current behavior**: Hardcoded Pterodactyl container ID and only displayed partial Docker stats for Nighty and Minecraft.
- **Source of evidence**: Live SSH audit of production VPS (`pm2 jlist`, `docker ps`, `ss -tulpn`, `/etc/nginx/sites-enabled/*`).

## User Scenarios And Success
- **Primary scenario**: Admin `@imbarb` executes `/system` in Discord. The bot renders an interactive multi-page dashboard displaying CPU, RAM, NVMe Disk, all PM2 services, all Docker containers, Pterodactyl gaming services, and reverse proxy routing.
- **Success criteria**:
  1. `/system` provides accurate metrics for all running VPS components.
  2. The 4 interactive tabs (`vps`, `web`, `nighty`, `mc`) plus `refresh` button respond dynamically.
  3. Safe fallback in local development when Docker or PM2 is absent.
  4. 100% passing tests and valid architectural linting.

## Non-Goals
- Modifying remote VPS Nginx configurations or restarting services from the bot command (read-only telemetry).
- Altering admin authorization boundaries (strictly limited to `@imbarb` and configured admin IDs).

## Constraints
- Maximum 5 buttons per Discord ActionRow.
- Max 25 fields and 6000 characters per Discord embed.
- Non-blocking execution (<2.5s timeout for system metric collection).
