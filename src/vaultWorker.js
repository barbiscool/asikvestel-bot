const dns = require('dns').promises;
const net = require('net');
const config = require('./config');
const { getDb, updateImageVaultBlob, updateClipVaultBlob, formatImageRow, formatClipRow } = require('./db');
const { isUrlExpired, refreshAttachmentUrls } = require('./cdnRefresher');
const vaultStorage = require('./vaultStorage');

// Security: Max allowed payload size in memory (50 MB) to prevent OOM
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 20000;
const MAX_REDIRECTS = 3;

// Loopback, private, link-local (cloud metadata), CGNAT, multicast/reserved, and IPv6 equivalents.
const BLOCKED_ADDRESSES = new net.BlockList();
for (const [addr, prefix] of [['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.168.0.0', 16], ['224.0.0.0', 3]]) {
  BLOCKED_ADDRESSES.addSubnet(addr, prefix, 'ipv4');
}
for (const [addr, prefix] of [['::', 127], ['64:ff9b::', 96], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]]) {
  BLOCKED_ADDRESSES.addSubnet(addr, prefix, 'ipv6');
}

// ::ffff:7f00:1 / ::ffff:127.0.0.1 -> 127.0.0.1 (Node versions differ on matching these against IPv4 rules).
function ipv4FromMapped(address) {
  const m = address.match(/^::ffff:(?:(\d+\.\d+\.\d+\.\d+)|([0-9a-f]{1,4}):([0-9a-f]{1,4}))$/i);
  if (!m) return null;
  if (m[1]) return m[1];
  const hi = parseInt(m[2], 16);
  const lo = parseInt(m[3], 16);
  return [hi >> 8, hi & 255, lo >> 8, lo & 255].join('.');
}

// Checks every address the host resolves to, not just the URL text, so DNS names and
// alternate IP spellings (0x7f.1, [::ffff:127.0.0.1]) can't reach internal services.
// shortcut: a DNS answer that changes between this check and fetch's own lookup (rebinding) still gets through.
async function assertPublicHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '');
  const addresses = await dns.lookup(host, { all: true, verbatim: true });
  for (const { address, family } of addresses) {
    const v4 = family === 6 ? ipv4FromMapped(address) : address;
    if (v4 ? BLOCKED_ADDRESSES.check(v4, 'ipv4') : BLOCKED_ADDRESSES.check(address, 'ipv6')) {
      throw new Error(`SSRF blocked: ${hostname} resolves to ${address}`);
    }
  }
}

/**
 * Safely fetches a media URL directly into an in-memory Buffer with SSRF defenses,
 * strict size caps, and timeouts. NEVER writes plaintext to disk.
 */
async function fetchMediaBuffer(rawUrl, { maxBytes = MAX_FILE_SIZE_BYTES, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('Invalid URL');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    let url = rawUrl;
    let res;
    // Follow redirects by hand so every hop gets the same host check.
    for (let hop = 0; ; hop++) {
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch {
        throw new Error(`Malformed URL: ${url}`);
      }
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new Error(`Unsupported protocol: ${parsedUrl.protocol}`);
      }
      await assertPublicHost(parsedUrl.hostname);

      res = await fetch(parsedUrl, {
        signal: controller.signal,
        redirect: 'manual',
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; AsikVestelVault/1.0)'
        }
      });

      const location = res.status >= 300 && res.status < 400 && res.headers.get('location');
      if (!location) break;
      if (hop >= MAX_REDIRECTS) throw new Error('Too many redirects');
      url = new URL(location, parsedUrl).href;
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const contentLength = parseInt(res.headers.get('content-length') || '0', 10);
    if (contentLength > maxBytes) {
      throw new Error(`File size exceeds limit (${contentLength} > ${maxBytes})`);
    }

    // Count while reading: content-length can be missing or wrong.
    const chunks = [];
    let total = 0;
    for await (const chunk of res.body) {
      total += chunk.length;
      if (total > maxBytes) {
        controller.abort();
        throw new Error(`Downloaded buffer exceeds limit (${total} bytes)`);
      }
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
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
