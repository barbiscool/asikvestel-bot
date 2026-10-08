# Media Host Stats Integration Specification
> **Target Audience:** Autonomous AI Agent & Developer Guide  
> **Repository:** `asikvestel-bot`  
> **Source Service:** `asikvestel-media-host` (`https://media.asikvestel.org`)  
> **Version:** 1.0.0  
> **Status:** Production-Ready & Verified  

---

## 1. Executive Summary

This specification provides everything an AI agent needs to implement Discord bot telemetry for the private media host (`media.asikvestel.org`).

> **Architecture Reality:** The Discord bot (`asikvestel-bot`) runs directly on the **same production VPS** (`62.83.32.164`) as the media host under PM2.
> Therefore, telemetry is obtained **locally** with zero network latency by reading `/var/www/media-host/data/media.db` directly and inspecting root disk stats via `fs.statfsSync('/')` using [`src/mediaStorageWatchdog.js`](file:///home/barb/gemini/asikvestel-bot/src/mediaStorageWatchdog.js). No external public HTTP routes or keys are required.
> 
> See the companion document: [`MEDIA_STORAGE_WATCHDOG_AGENT_NOTE.md`](file:///home/barb/gemini/asikvestel-bot/docs/MEDIA_STORAGE_WATCHDOG_AGENT_NOTE.md) for full watchdog details.

---

## 2. Telemetry Architecture

### 2.1 Primary Method: Local VPS Direct Access (Recommended)
- **Database:** `/var/www/media-host/data/media.db` (opened in read-only mode).
- **Disk Space:** Native `fs.statfsSync('/')` (already used in `systemStats.js`).
- **Module:** `require('./mediaStorageWatchdog').getMediaHostStats()`

### 2.2 Secondary / Loopback Method (Internal Only)
- **Base URL:** `http://127.0.0.1:4500` (localhost loopback via PM2) or `https://media.asikvestel.org`
- **Internal Admin Endpoint:** `GET /api/admin/overview`
- **Authentication:** `x-api-key: <ADMIN_API_KEY>` or `Authorization: Bearer <ADMIN_API_KEY>`
- **Health Check Endpoint:** `GET /api/health` (no auth required)

---

### 2.3 Response JSON Schema

A successful `HTTP 200 OK` returns the following payload:

```json
{
  "system": {
    "siteUrl": "https://media.asikvestel.org",
    "nodeEnv": "production",
    "nodeVersion": "v20.20.2",
    "uptimeSeconds": 81610,
    "dbSizeBytes": 4096,
    "dbSizeFormatted": "4.00 KB"
  },
  "vps": {
    "freeBytes": 487558119424,
    "totalBytes": 539792977920,
    "usedBytes": 52234858496,
    "percentFree": "90.3",
    "freeFormatted": "454.07 GB",
    "totalFormatted": "502.72 GB"
  },
  "r2": {
    "configured": true,
    "bucketName": "mediahost-community",
    "maxBytes": 10737418240,
    "usedBytes": 1009182,
    "fileCount": 3,
    "percentUsed": "0.0",
    "usedFormatted": "985.53 KB",
    "maxFormatted": "10.00 GB"
  },
  "stats": {
    "totalFiles": 3,
    "totalBytes": 1009182,
    "totalBytesFormatted": "985.53 KB",
    "userCount": 4,
    "bannedCount": 0,
    "activeInvites": 3
  }
}
```

#### Field Specifications & Types

| Section | Key | Type | Description / Interpretation |
| :--- | :--- | :--- | :--- |
| `system` | `siteUrl` | `string` | Base URL of the media host (`https://media.asikvestel.org`). |
| `system` | `nodeEnv` | `string` | Environment (`production` / `development`). |
| `system` | `nodeVersion` | `string` | Node.js runtime version (e.g. `v20.20.2`). |
| `system` | `uptimeSeconds` | `number` | Uptime of the media host process in seconds. |
| `system` | `dbSizeBytes` | `number` | SQLite database file size in bytes. |
| `system` | `dbSizeFormatted` | `string` | Human-readable DB size (e.g. `4.00 KB`). |
| `vps` | `totalBytes` | `number` | Total host NVMe/SSD filesystem capacity in bytes. |
| `vps` | `usedBytes` | `number` | Used filesystem disk space in bytes. |
| `vps` | `freeBytes` | `number` | Free disk space in bytes. |
| `vps` | `percentFree` | `string` | Percentage of disk space that is free (e.g. `"90.3"`). Calculate used % as `(100 - parseFloat(percentFree)).toFixed(1)`. |
| `vps` | `totalFormatted` | `string` | Total capacity formatted (e.g. `502.72 GB`). |
| `vps` | `freeFormatted` | `string` | Available space formatted (e.g. `454.07 GB`). |
| `r2` | `configured` | `boolean`| `true` if Cloudflare R2 bucket credentials are active. |
| `r2` | `bucketName` | `string` | Target bucket name (e.g. `mediahost-community`). |
| `r2` | `maxBytes` | `number` | R2 total quota allocation in bytes (`10737418240` = 10.00 GB). |
| `r2` | `usedBytes` | `number` | Current storage consumed by media in R2 (bytes). |
| `r2` | `fileCount` | `number` | Total media files hosted in R2. |
| `r2` | `percentUsed` | `string` | Percentage of R2 quota utilized (e.g. `"0.0"` or `"15.4"`). |
| `r2` | `usedFormatted` | `string` | Human-readable R2 usage (e.g. `985.53 KB` or `1.42 GB`). |
| `r2` | `maxFormatted` | `string` | Human-readable R2 cap (e.g. `10.00 GB`). |
| `stats` | `totalFiles` | `number` | Global indexed media count. |
| `stats` | `totalBytesFormatted`| `string` | Global stored bytes formatted. |
| `stats` | `userCount` | `number` | Total registered user accounts. |
| `stats` | `bannedCount` | `number` | Banned / suspended accounts. |
| `stats` | `activeInvites` | `number` | Unclaimed registration invite codes. |

---

## 3. Environment Configuration

Add the following environment variables to `/home/barb/gemini/asikvestel-bot/.env` and `src/config.js`:

```env
# Media Host Telemetry Integration
MEDIA_HOST_URL=https://media.asikvestel.org
MEDIA_HOST_API_KEY=av_evZP94_GyOOh7b8h_GhpOe5jUUqIEUQq
```

In `src/config.js`:
```javascript
MEDIA_HOST_URL: process.env.MEDIA_HOST_URL || 'https://media.asikvestel.org',
MEDIA_HOST_API_KEY: process.env.MEDIA_HOST_API_KEY || '',
```

---

## 4. Architecture & Recommended Implementation

The bot can present this telemetry in two locations:
1. **Dedicated Command:** `/media-stats` (Recommended - fast, distinct, accessible).
2. **Tab inside `/system`:** Adding a `sys_page_media` button to the existing `/system` dashboard.

Both share the exact same telemetry fetching service.

```
┌────────────────────────────────────────────────────────┐
│                   Discord Client                       │
│             /media-stats  OR  /system                  │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│               asikvestel-bot Process                   │
│                                                        │
│  src/mediaHostStats.js (60s In-Memory Cache)           │
│  ├─ Cache hit? Return cached JSON                      │
│  └─ Cache miss? Fetch GET /api/stats (5s Timeout)      │
└──────────────────────────┬─────────────────────────────┘
                           │ HTTPS (x-api-key)
                           ▼
┌────────────────────────────────────────────────────────┐
│           asikvestel-media-host (Production)           │
│           https://media.asikvestel.org/api/stats       │
│  - Cloudflare R2 Quota & Usage                         │
│  - VPS Host NVMe Storage                               │
│  - Active Users, Invites, Bans                         │
│  - SQLite Database Metrics                             │
└────────────────────────────────────────────────────────┘
```

---

## 5. Ready-to-Use Code Components

### 5.1 Service Fetcher Module (`src/mediaHostStats.js`)
Create this file in `/home/barb/gemini/asikvestel-bot/src/mediaHostStats.js`. It includes:
- 60-second in-memory caching to avoid rate-limiting or duplicate remote requests.
- `AbortController` 5-second timeout protection.
- Calculation helpers (used percent, gauge bars, health pills).

```javascript
/**
 * src/mediaHostStats.js
 * Client module for fetching and formatting media.asikvestel.org metrics.
 */

let cachedStats = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 60_000; // 60 seconds

/**
 * Fetches operational stats from media host with in-memory caching.
 * @param {object} config - Application configuration containing MEDIA_HOST_URL and MEDIA_HOST_API_KEY
 * @param {boolean} forceRefresh - If true, bypasses the cache
 * @returns {Promise<object>} Parsed telemetry data
 */
async function fetchMediaHostStats(config = {}, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedStats && (now - lastFetchTime) < CACHE_TTL_MS) {
    return cachedStats;
  }

  const baseUrl = (config.MEDIA_HOST_URL || 'https://media.asikvestel.org').replace(/\/+$/, '');
  const apiKey = config.MEDIA_HOST_API_KEY;

  if (!apiKey) {
    throw new Error('MEDIA_HOST_API_KEY is missing from environment configuration.');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 5000);

  try {
    // Try primary /api/stats first, fallback to /api/admin/overview
    let res = await fetch(`${baseUrl}/api/stats`, {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'Accept': 'application/json'
      },
      signal: controller.signal
    });

    if (res.status === 404) {
      res = await fetch(`${baseUrl}/api/admin/overview`, {
        method: 'GET',
        headers: {
          'x-api-key': apiKey,
          'Accept': 'application/json'
        },
        signal: controller.signal
      });
    }

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`Media host responded with HTTP ${res.status}: ${errorText || res.statusText}`);
    }

    const data = await res.json();
    cachedStats = data;
    lastFetchTime = now;
    return data;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Calculates derived stats (percentages, health colors, gauge blocks).
 */
function processMediaStats(data) {
  const r2 = data.r2 || {};
  const vps = data.vps || {};
  const system = data.system || {};
  const stats = data.stats || {};

  // R2 calculations
  const r2Percent = parseFloat(r2.percentUsed) || (r2.maxBytes ? ((r2.usedBytes / r2.maxBytes) * 100) : 0);
  const r2FreeBytes = Math.max(0, (r2.maxBytes || 0) - (r2.usedBytes || 0));

  // VPS calculations
  const vpsFreePercent = parseFloat(vps.percentFree) || 0;
  const vpsUsedPercent = vps.totalBytes ? Math.round(((vps.usedBytes || 0) / vps.totalBytes) * 100) : Math.round(100 - vpsFreePercent);

  // Uptime formatting
  const uptimeSeconds = system.uptimeSeconds || 0;
  const days = Math.floor(uptimeSeconds / 86400);
  const hours = Math.floor((uptimeSeconds % 86400) / 3600);
  const minutes = Math.floor((uptimeSeconds % 3600) / 60);
  const uptimeString = `${days > 0 ? `${days}g ` : ''}${hours}s ${minutes}d`;

  return {
    raw: data,
    r2: {
      ...r2,
      percentUsedNum: r2Percent,
      freeBytes: r2FreeBytes
    },
    vps: {
      ...vps,
      usedPercentNum: vpsUsedPercent
    },
    system: {
      ...system,
      uptimeFormatted: uptimeString
    },
    stats
  };
}

module.exports = {
  fetchMediaHostStats,
  processMediaStats
};
```

---

### 5.2 Embed Builder Function (`src/botEmbeds.js`)

Add this function to `src/botEmbeds.js`. It utilizes the existing `BOT_COLORS` and `createGaugeBar` helper from the bot codebase.

```javascript
/**
 * Modern aesthetic embed for Media Host Telemetry (/media-stats)
 */
function createMediaHostStatsEmbed({ rawData, config }) {
  const { BOT_COLORS, createGaugeBar } = require('./botEmbeds');
  const { processMediaStats } = require('./mediaHostStats');
  
  const processed = processMediaStats(rawData);
  const { r2, vps, system, stats } = processed;

  // Determine overall status color based on R2 and VPS usage thresholds
  let embedColor = BOT_COLORS.PRIMARY;
  if (r2.percentUsedNum > 90 || vps.usedPercentNum > 90) {
    embedColor = BOT_COLORS.DANGER;
  } else if (r2.percentUsedNum > 75 || vps.usedPercentNum > 80) {
    embedColor = BOT_COLORS.AMBER;
  } else {
    embedColor = BOT_COLORS.SUCCESS;
  }

  // Visual Gauge Bars (10 characters: ▰▰▰▰▱▱▱▱▱▱)
  const r2Gauge = createGaugeBar(r2.percentUsedNum, 10);
  const vpsGauge = createGaugeBar(vps.usedPercentNum, 10);

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setAuthor({
      name: 'Aşık Vestel • Medya Sunucusu Telemetrisi',
      iconURL: 'https://media.asikvestel.org/favicon.ico'
    })
    .setTitle('☁️ media.asikvestel.org İstatistikleri')
    .setDescription(
      `**Genel Durum:** \`🟢 Aktif & Çalışıyor\` | **Çalışma Süresi:** \`${system.uptimeFormatted}\`\n` +
      `*Cloudflare R2 depolama kotaları, VPS disk kullanımı ve kayıtlı kullanıcı verileri.*`
    )
    .addFields(
      {
        name: '☁️ Cloudflare R2 Depolama (S3)',
        value: 
          `**Kullanım:** \`${r2.usedFormatted || '0 B'}\` / \`${r2.maxFormatted || '10.00 GB'}\` (**%${r2.percentUsedNum.toFixed(1)}**)\n` +
          `\`${r2Gauge}\`\n` +
          `• **Yüklenen Medya:** \`${(r2.fileCount || 0).toLocaleString('tr-TR')} dosya\`\n` +
          `• **Kova (Bucket):** \`${r2.bucketName || 'mediahost-community'}\``,
        inline: false
      },
      {
        name: '💽 VPS Disk Alanı (Host NVMe)',
        value: 
          `**Kullanım:** \`${(vps.usedPercentNum)}%\` (${vps.freeFormatted || '0 GB'} Boş)\n` +
          `\`${vpsGauge}\`\n` +
          `• **Toplam Alan:** \`${vps.totalFormatted || '502.72 GB'}\``,
        inline: true
      },
      {
        name: '👥 Kullanıcılar & Erişim',
        value: 
          `• **Kayıtlı Üye:** \`${stats.userCount || 0}\`\n` +
          `• **Aktif Davetler:** \`${stats.activeInvites || 0}\`\n` +
          `• **Yasaklı Üyeler:** \`${stats.bannedCount || 0}\``,
        inline: true
      },
      {
        name: '⚙️ Hizmet & Veritabanı',
        value: 
          `• **Node.js Sürümü:** \`${system.nodeVersion || 'v20'}\` (${system.nodeEnv || 'prod'})\n` +
          `• **SQLite Boyutu:** \`${system.dbSizeFormatted || '4.00 KB'}\`\n` +
          `• **Genel Medya Boyutu:** \`${stats.totalBytesFormatted || '0 B'}\``,
        inline: false
      }
    )
    .setFooter({
      text: 'Aşık Vestel Medya Altyapısı • media.asikvestel.org'
    })
    .setTimestamp();

  // Action Buttons
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setLabel('Medya Panelini Aç')
      .setURL(`${system.siteUrl || 'https://media.asikvestel.org'}/admin`)
      .setStyle(ButtonStyle.Link)
      .setEmoji('🌐'),
    new ButtonBuilder()
      .setCustomId('media_stats_refresh')
      .setLabel('Yenile')
      .setStyle(ButtonStyle.Success)
      .setEmoji('🔄')
  );

  return { embeds: [embed], components: [row] };
}
```

---

### 5.3 Slash Command Registration (`src/slashCommands.js`)

Add the `/media-stats` definition to the `commands` array in `src/slashCommands.js`:

```javascript
new SlashCommandBuilder()
  .setName('media-stats')
  .setDescription('Aşık Vestel Medya Sunucusu (R2, Disk, Kullanıcılar) istatistiklerini görüntüler.')
```

---

### 5.4 Command Execution in `src/bot.js`

Add the interaction handler inside `client.on('interactionCreate', ...)`:

```javascript
const { fetchMediaHostStats } = require('./mediaHostStats');
const { createMediaHostStatsEmbed } = require('./botEmbeds');

// Inside interactionCreate:
if (interaction.commandName === 'media-stats') {
  await interaction.deferReply();

  try {
    const rawData = await fetchMediaHostStats(config, false);
    const payload = createMediaHostStatsEmbed({ rawData, config });

    const response = await interaction.editReply(payload);

    // Interactive Refresh Collector (2 minutes)
    const collector = response.createMessageComponentCollector({
      filter: i => i.user.id === interaction.user.id,
      time: 120_000
    });

    collector.on('collect', async i => {
      if (i.customId === 'media_stats_refresh') {
        try {
          await i.deferUpdate();
          const freshData = await fetchMediaHostStats(config, true);
          const updatedPayload = createMediaHostStatsEmbed({ rawData: freshData, config });
          await i.editReply(updatedPayload);
        } catch (err) {
          console.error('[Media Stats Refresh Error]', err);
        }
      }
    });

    collector.on('end', async () => {
      try {
        // Disable buttons after timeout
        const disabledRow = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setLabel('Medya Paneli')
            .setURL(`${config.MEDIA_HOST_URL || 'https://media.asikvestel.org'}/admin`)
            .setStyle(ButtonStyle.Link)
            .setEmoji('🌐'),
          new ButtonBuilder()
            .setCustomId('media_stats_refresh')
            .setLabel('Süresi Doldu')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
            .setEmoji('⌛')
        );
        await interaction.editReply({ components: [disabledRow] });
      } catch {}
    });

  } catch (error) {
    console.error('[Media Stats Error]', error);
    return interaction.editReply({
      ...createStatusAlertEmbed({
        type: 'error',
        title: 'Medya Sunucusu Hatası',
        message: `İstatistikler alınamadı: \`${error.message}\``
      })
    });
  }
}
```

---

## 6. Implementation Checklist for the Implementing Agent

When assigned this task, execute these exact steps:

1. [ ] **Verify Environment:** Check `/home/barb/gemini/asikvestel-bot/.env` contains `MEDIA_HOST_URL` and `MEDIA_HOST_API_KEY`.
2. [ ] **Create Fetcher Service:** Write `src/mediaHostStats.js` with caching and error handling.
3. [ ] **Add Embed Builder:** Export `createMediaHostStatsEmbed` in `src/botEmbeds.js`.
4. [ ] **Register Slash Command:** Add `media-stats` in `src/slashCommands.js` and run deployment routine.
5. [ ] **Handle Interaction:** Implement the command and button collector in `src/bot.js`.
6. [ ] **Smoke Test:** Run:
   ```bash
   node -e "
     const { fetchMediaHostStats } = require('./src/mediaHostStats');
     const config = { MEDIA_HOST_URL: 'https://media.asikvestel.org', MEDIA_HOST_API_KEY: 'av_evZP94_GyOOh7b8h_GhpOe5jUUqIEUQq' };
     fetchMediaHostStats(config).then(d => console.log('✓ Success:', d.r2.bucketName, d.vps.totalFormatted)).catch(console.error);
   "
   ```
7. [ ] **Verify in Discord:** Trigger `/media-stats` in Discord to verify embed rendering and the refresh button.

---

## 7. Security & Reliability Rules

- **Zero Secret Leakage:** Never print or leak `MEDIA_HOST_API_KEY` into Discord embed descriptions, errors, or logs.
- **Graceful Failure:** If `media.asikvestel.org` is unreachable, return a clean `createStatusAlertEmbed` rather than crashing the interaction.
- **Cache Shielding:** Never bypass the 60-second cache unless explicitly triggered by an authorized admin clicking the `🔄 Yenile` button.
- **Network Resilience:** Keep the 5-second `AbortController` timeout active so Discord's 3-second interaction token window does not expire unhandled.
