#!/bin/bash
# ==============================================================================
# Aşık Vestel Standalone Discord Bot - Canlı Deploy Scripti
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$SCRIPT_DIR"

VPS_IP="62.83.32.164"
VPS_USER="root"
VPS_TARGET="${VPS_USER}@${VPS_IP}"
REMOTE_DIR="/var/www/asikvestel-bot"

echo "========================================================"
echo "🤖 AŞIK VESTEL DISCORD BOT DEPLOY PIPELINE"
echo "========================================================"

# 1. Yerel Doğrulama
echo "[1/4] Yerel test ve lint doğrulaması çalıştırılıyor..."
npm run verify

# 2. Dosya Aktarımı (Rsync)
echo "[2/4] Dosyalar canlı VPS sunucusuna aktarılıyor (${VPS_TARGET}:${REMOTE_DIR})..."
ssh -o BatchMode=yes -o ConnectTimeout=15 "${VPS_TARGET}" "mkdir -p ${REMOTE_DIR}"

rsync -avz --exclude '.git' \
           --exclude 'node_modules' \
           --exclude 'tests' \
           --exclude 'harness' \
           --exclude 'graphify-out' \
           --exclude '.env' \
           -e "ssh -o BatchMode=yes -o ConnectTimeout=15" \
           ./ "${VPS_TARGET}:${REMOTE_DIR}/"

# 3. Bağımlılıklar
echo "[3/4] VPS üzerinde bağımlılıklar kontrol ediliyor..."
ssh -o BatchMode=yes -o ConnectTimeout=30 "${VPS_TARGET}" "cd ${REMOTE_DIR} && npm install --omit=dev"

# 4. PM2 Yeniden Başlatma / Başlatma
echo "[4/4] PM2 asikvestel-bot servisi yeniden başlatılıyor..."
ssh -o BatchMode=yes -o ConnectTimeout=15 "${VPS_TARGET}" "
  if pm2 describe asikvestel-bot > /dev/null 2>&1; then
    pm2 reload asikvestel-bot --update-env
  else
    cd ${REMOTE_DIR} && pm2 start ecosystem.config.js
  fi
  pm2 save
"

echo "========================================================"
echo "🎉 DEPLOY BAŞARIYLA TAMAMLANDI!"
echo "🤖 Bot Durumu : pm2 logs asikvestel-bot"
echo "========================================================"
