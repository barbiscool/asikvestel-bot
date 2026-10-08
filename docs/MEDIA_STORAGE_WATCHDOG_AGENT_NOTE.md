# Media Host Storage Watchdog & Admin Telemetry — Agent Architecture Note
> **Target Audience:** Autonomous AI Agent & Developer Maintenance  
> **Bot Service:** `asikvestel-bot`  
> **Host Environment:** Same VPS (`62.83.32.164`, PM2 service: `asikvestel-bot`)  
> **Media Host Location:** `/var/www/media-host/` (PM2 service: `asikvestel-media`)  
> **Admin Recipient:** `@imbarb` (Discord ID: `735152588801966132`)  

---

## 1. Context & Architecture (Single-VPS Model)

### What Happened & Why It Was Moved:
Previously, the storage watchdog and Discord DM notification logic lived inside the media host web repository (`asikvestel-media-host/src/services/discordNotifier.js` and `tierManager.js`). In that design, the Express web server was attempting to make raw REST calls to Discord's `/api/v10/users/@me/channels` using separate bot tokens and webhooks.

**Crucial Clarification:**
`asikvestel-bot` is **NOT** a remote bot running on a different machine. It runs directly on the **same production VPS** (`62.83.32.164`) under PM2 alongside `asikvestel-media` and `asikvestel-vault`.

Therefore:
1. **Zero External API Routes Required:** The bot does not need public HTTP endpoints or API keys to read media stats. Any speculative external routes (like `/api/stats`) were reverted for security.
2. **Direct Local Access:** The bot reads the media host SQLite database directly on disk (`/var/www/media-host/data/media.db`) and inspects the NVMe filesystem disk stats directly via `fs.statfsSync('/')`.
3. **Native Discord Dispatch:** The bot uses its active Discord.js client instance to dispatch direct messages to the admin (`client.users.fetch('735152588801966132').then(u => u.send(...))`) without needing separate webhooks or token passing.

---

## 2. Core Implementation Files

### 2.1 Storage Watchdog Module
**Path:** [`/home/barb/gemini/asikvestel-bot/src/mediaStorageWatchdog.js`](file:///home/barb/gemini/asikvestel-bot/src/mediaStorageWatchdog.js)
- **Database Resolution:** Automatically finds `/var/www/media-host/data/media.db` on production, with fallback to dev paths (`config.MEDIA_DB_PATH`).
- **Direct Queries:** Opens `media.db` in read-only mode using `node:sqlite` (with fallback to `better-sqlite3`), querying:
  - Total media count and total stored bytes.
  - Cloudflare R2 count and bytes (`storage_tier = 'r2'`).
  - VPS on-disk count and bytes (`storage_tier = 'vps'`).
  - Active users and active invite tokens.
- **Disk Space Check:** Uses `fs.statfsSync('/')` for host NVMe disk capacity and free space.
- **Alert Conditions:**
  - **Cloudflare R2:** Trigger alert when R2 storage exceeds **8.5 GB** (out of 10.00 GB free tier cap).
  - **VPS Disk:** Trigger alert when free filesystem space drops below **10.0%**.
- **1-Hour Alert Cooldown:** Enforces an in-memory 1-hour cooldown (`ALERT_COOLDOWN_MS = 3600000`) so the admin is never spammed if storage remains high.
- **Watchdog Timer:** `initMediaStorageWatchdog(client, config)` starts an unreferenced hourly background interval with an initial sanity check 15 seconds after boot.
- **Process Stop:** `stopMediaStorageWatchdog()` cleanly clears timers.

---

## 3. How to Use in the Discord Bot

### 3.1 Automatic Hourly Watchdog in `src/bot.js`
In [`src/bot.js`](file:///home/barb/gemini/asikvestel-bot/src/bot.js), initialize the watchdog during client setup:

```javascript
const { initMediaStorageWatchdog } = require('./mediaStorageWatchdog');

// When initializing bot background trackers:
initMediaStorageWatchdog(client, config);
```

### 3.2 Displaying Media Telemetry in Slash Commands
If you want to display media host stats in `/system` or a dedicated `/media-stats` slash command:

```javascript
const { getMediaHostStats } = require('./mediaStorageWatchdog');

// Read directly from local SQLite and host statfsSync:
const stats = getMediaHostStats(config);
// stats.r2: { usedBytes, maxBytes, percentUsed, fileCount, usedFormatted, maxFormatted }
// stats.vps: { freeBytes, totalBytes, percentFree, percentUsed, freeFormatted, totalFormatted }
// stats.stats: { totalFiles, totalBytes, userCount, activeInvites, bannedCount }
```

No network requests, no latency, 100% resilient to web server downtime.

---

## 4. Test Suite & Verification

Unit tests for this module are located at:
[`/home/barb/gemini/asikvestel-bot/tests/mediaStorageWatchdog.test.js`](file:///home/barb/gemini/asikvestel-bot/tests/mediaStorageWatchdog.test.js)

To run the test suite and verify architecture compliance:
```bash
cd /home/barb/gemini/asikvestel-bot
npm test
npm run verify
```
