const path = require('path');
const config = require('./config');
const { getDb, updateImageVaultBlob, updateClipVaultBlob, formatImageRow, formatClipRow } = require('./db');
const { isUrlExpired, refreshAttachmentUrls } = require('./cdnRefresher');
const vaultStorage = require('./vaultStorage');

// Security: Max allowed payload size in memory (50 MB) to prevent OOM
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 20000;

function isPrivateIpOrForbidden(hostname) {
  if (!hostname) return true;
  const lower = hostname.toLowerCase();
  if (lower === 'localhost' || lower === '127.0.0.1' || lower === '::1' || lower === '0.0.0.0') {
    return true;
  }
  // Check private IPv4 ranges: 10.x.x.x, 172.16-31.x.x, 192.168.x.x, 169.254.x.x (AWS/cloud metadata)
  const parts = lower.split('.').map(p => parseInt(p, 10));
  if (parts.length === 4 && parts.every(p => !isNaN(p) && p >= 0 && p <= 255)) {
    if (parts[0] === 10) return true;
    if (parts[0] === 127) return true;
    if (parts[0] === 169 && parts[1] === 254) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
  }
  return false;
}

/**
 * Safely fetches a media URL directly into an in-memory Buffer with SSRF defenses,
 * strict size caps, and timeouts. NEVER writes plaintext to disk.
 */
async function fetchMediaBuffer(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('Invalid URL');
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    throw new Error(`Malformed URL: ${rawUrl}`);
  }

  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    throw new Error(`Unsupported protocol: ${parsedUrl.protocol}`);
  }

  // SSRF prevention: reject private/metadata IPs
  if (isPrivateIpOrForbidden(parsedUrl.hostname)) {
    throw new Error(`SSRF blocked: forbidden destination ${parsedUrl.hostname}`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);

  try {
    const res = await fetch(rawUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; AsikVestelVault/1.0)'
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
    if (contentLength > MAX_FILE_SIZE_BYTES) {
      throw new Error(`File size exceeds limit (${contentLength} > ${MAX_FILE_SIZE_BYTES})`);
    }

    const arrayBuf = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);

    if (buffer.length > MAX_FILE_SIZE_BYTES) {
      throw new Error(`Downloaded buffer exceeds limit (${buffer.length} bytes)`);
    }

    return buffer;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Migrates unencrypted images from images_vault into AES-256-GCM zero-plaintext storage.
 */
async function migrateImagesVault(options = {}) {
  const { limit = 100, dryRun = false, concurrency = 4 } = options;
  const db = getDb();

  // Find images without a blob_id
  const rows = db.prepare(`
    SELECT * FROM images_vault 
    WHERE blob_id IS NULL OR blob_id = ''
    ORDER BY created_at DESC 
    LIMIT ?
  `).all(limit).map(formatImageRow);

  console.log(`[VaultWorker] Found ${rows.length} pending images in images_vault to migrate.`);
  if (rows.length === 0) return { processed: 0, succeeded: 0, failed: 0 };

  // 1. Refresh Discord CDN tokens in batch if expired
  const discordUrls = rows
    .filter(r => r.image_url && r.image_url.includes('cdn.discordapp.com'))
    .map(r => r.image_url);

  let refreshedMap = {};
  if (discordUrls.length > 0 && config.BOT_TOKEN) {
    console.log(`[VaultWorker] Refreshing ${discordUrls.length} Discord CDN URLs via Discord API...`);
    refreshedMap = await refreshAttachmentUrls(config.BOT_TOKEN, discordUrls);
  }

  let succeeded = 0;
  let failed = 0;

  // Process in small batches with concurrency
  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency);
    await Promise.all(batch.map(async (row) => {
      const liveUrl = refreshedMap[row.image_url] || row.image_url;
      try {
        if (!liveUrl || !liveUrl.startsWith('http')) {
          console.warn(`[VaultWorker] Skipping image #${row.id} - invalid URL: ${liveUrl}`);
          failed++;
          return;
        }

        if (dryRun) {
          console.log(`[VaultWorker][DryRun] Would fetch & encrypt image #${row.id} from ${liveUrl.slice(0, 60)}...`);
          succeeded++;
          return;
        }

        const buf = await fetchMediaBuffer(liveUrl);
        const { blobId } = await vaultStorage.encryptAndSaveBlob(buf);

        // Update database with blob_id (preserves original image_url as historical reference)
        updateImageVaultBlob(row.id, blobId);
        succeeded++;
        console.log(`[VaultWorker] Migrated image #${row.id} -> blob ${blobId.slice(0, 12)}... (${buf.length} bytes)`);
      } catch (err) {
        console.error(`[VaultWorker] Failed to migrate image #${row.id} (${liveUrl}):`, err.message);
        failed++;
      }
    }));
  }

  return { processed: rows.length, succeeded, failed };
}

/**
 * Migrates unencrypted Discord video clips from clips into AES-256-GCM zero-plaintext storage.
 */
async function migrateClipsVault(options = {}) {
  const { limit = 20, dryRun = false, concurrency = 2 } = options;
  const db = getDb();

  const rows = db.prepare(`
    SELECT * FROM clips 
    WHERE (blob_id IS NULL OR blob_id = '') 
      AND media_type = 'video_discord'
    ORDER BY created_at DESC 
    LIMIT ?
  `).all(limit).map(formatClipRow);

  console.log(`[VaultWorker] Found ${rows.length} pending Discord clips to migrate.`);
  if (rows.length === 0) return { processed: 0, succeeded: 0, failed: 0 };

  const discordUrls = rows.filter(r => r.media_url && r.media_url.includes('cdn.discordapp.com')).map(r => r.media_url);
  let refreshedMap = {};
  if (discordUrls.length > 0 && config.BOT_TOKEN) {
    refreshedMap = await refreshAttachmentUrls(config.BOT_TOKEN, discordUrls);
  }

  let succeeded = 0;
  let failed = 0;

  for (let i = 0; i < rows.length; i += concurrency) {
    const batch = rows.slice(i, i + concurrency);
    await Promise.all(batch.map(async (row) => {
      const liveUrl = refreshedMap[row.media_url] || row.media_url;
      try {
        if (!liveUrl || !liveUrl.startsWith('http')) {
          failed++;
          return;
        }

        if (dryRun) {
          console.log(`[VaultWorker][DryRun] Would fetch & encrypt clip #${row.id}...`);
          succeeded++;
          return;
        }

        const buf = await fetchMediaBuffer(liveUrl);
        const { blobId } = await vaultStorage.encryptAndSaveBlob(buf);

        updateClipVaultBlob(row.id, blobId);
        succeeded++;
        console.log(`[VaultWorker] Migrated clip #${row.id} -> blob ${blobId.slice(0, 12)}... (${buf.length} bytes)`);
      } catch (err) {
        console.error(`[VaultWorker] Failed to migrate clip #${row.id}:`, err.message);
        failed++;
      }
    }));
  }

  return { processed: rows.length, succeeded, failed };
}

// Standalone CLI runner
if (require.main === module) {
  const args = process.argv.slice(2);
  const isMigrate = args.includes('--migrate');
  const isDryRun = args.includes('--dry-run');
  const typeArgIndex = args.indexOf('--type');
  const targetType = typeArgIndex !== -1 ? args[typeArgIndex + 1] : 'all';
  const limitArgIndex = args.indexOf('--limit');
  const limit = limitArgIndex !== -1 ? parseInt(args[limitArgIndex + 1], 10) : 100;

  if (!isMigrate && !isDryRun) {
    console.log(`
Usage: node backend/src/vaultWorker.js [options]
  --migrate         Execute migration into AES-256-GCM encrypted vault
  --dry-run         Simulate migration without downloading or writing
  --type <type>     Target media type: "images", "clips", or "all" (default: all)
  --limit <number>  Max records to process in this run (default: 100)
    `);
    process.exit(0);
  }

  (async () => {
    try {
      console.log(`[VaultWorker] Starting migration (dryRun=${isDryRun}, type=${targetType}, limit=${limit})...`);
      if (targetType === 'images' || targetType === 'all') {
        const imgResult = await migrateImagesVault({ limit, dryRun: isDryRun });
        console.log('[VaultWorker] Images migration result:', imgResult);
      }
      if (targetType === 'clips' || targetType === 'all') {
        const clipResult = await migrateClipsVault({ limit: Math.min(limit, 20), dryRun: isDryRun });
        console.log('[VaultWorker] Clips migration result:', clipResult);
      }
      console.log('[VaultWorker] Migration batch completed successfully.');
      process.exit(0);
    } catch (err) {
      console.error('[VaultWorker] Fatal error:', err);
      process.exit(1);
    }
  })();
}

module.exports = {
  fetchMediaBuffer,
  migrateImagesVault,
  migrateClipsVault
};
