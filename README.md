# 🤖 Aşık Vestel Discord Bot

Standalone Discord.js bot and media vault ingestion engine for the Aşık Vestel community.

## 🚀 Features

- **Media & Clip Vault Ingestion:** Automatically detects, categorizes, and streams Discord clips, YouTube links, and media into an AES-256-GCM encrypted local vault.
- **Slash Commands:** `/clip`, `/resim-ekle`, `/stats`, `/wrapped`, and telemetry management.
- **Server Telemetry (`/sistem`):** Real-time monitoring of VPS resources, Web API latency, Nighty headless selfbot, and Minecraft server status with interactive Discord ActionRow buttons.
- **Voice Channel Tracker:** Tracks and aggregates real-time voice chat durations across guilds without blocking SQLite queries.
- **Zero-Limit Spotify Presence Tracker:** Real-time scrobbler tracking guild members' Spotify activities directly via the Discord Gateway.
- **Web-to-Discord Chat Bridge:** Connects browser SSE users to Discord text channels with mention resolution and webhook delivery.

## 🛠️ Installation & Setup

```bash
# 1. Install dependencies
npm install

# 2. Configure environment variables
cp .env.example .env
nano .env

# 3. Run tests
npm test

# 4. Start standalone bot
npm start
```

## ⚙️ PM2 Production Deployment

```bash
pm2 start ecosystem.config.js
pm2 logs asikvestel-bot
```
