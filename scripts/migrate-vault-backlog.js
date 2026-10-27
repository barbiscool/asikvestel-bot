#!/usr/bin/env node
/**
 * Copies old clips and images that have no vault copy yet into the encrypted vault, newest first.
 * Unlike `vaultWorker.js --migrate` (which re-picks the same newest failures on every run), this walks
 * the rows once by id, so rows that fail (deleted message, dead link) are skipped and the rest go on.
 * Safe to stop and rerun: finished rows have a blob_id and drop out. Original URLs stay as they are.
 *
 *   node scripts/migrate-vault-backlog.js [--dry-run] [--type images|clips|all] [--max N] [--min-free-gb 20]
 */
const fs = require('fs');
const config = require('../src/config');
const { getDb, closeDb, formatImageRow, formatClipRow, updateImageVaultBlob, updateClipVaultBlob } = require('../src/db');
const { fetchMediaBuffer } = require('../src/vaultWorker');
const vaultStorage = require('../src/vaultStorage');
const { createQueue } = require('../src/vaultQueue');

const KINDS = {
  images: { table: 'images_vault', urlField: 'image_url', extraWhere: '', format: formatImageRow, save: updateImageVaultBlob },
  clips: { table: 'clips', urlField: 'media_url', extraWhere: "AND media_type = 'video_discord'", format: formatClipRow, save: updateClipVaultBlob }
};

const DISCORD_HOST = /^https:\/\/(cdn\.discordapp\.com|media\.discordapp\.net)\//;

/**
 * Asks Discord for a working link for every Discord-hosted URL. cdnRefresher only refreshes links whose
 * expiry parameter is past, but old links without one are dead too and Discord can still re-sign most of them.
 */
async function refreshAll(urls) {
  const out = {};
  for (let i = 0; i < urls.length; i += 50) {
    try {
      const res = await fetch('https://discord.com/api/v10/attachments/refresh-urls', {
        method: 'POST',
        headers: { Authorization: `Bot ${config.BOT_TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ attachment_urls: urls.slice(i, i + 50) }),
        signal: AbortSignal.timeout(10000)
      });
      if (!res.ok) continue;
      for (const item of (await res.json()).refreshed_urls || []) out[item.original] = item.refreshed;
    } catch {}
  }
  return out;
}

function freeBytes(dir) {
  const s = fs.statfsSync(dir);
  return s.bavail * s.bsize;
}

/**
 * @returns {{processed:number, succeeded:number, failed:number, stoppedFor:string|null}}
 * deps (for tests): fetchBuffer, saveBlob, refresh, freeBytesOf
 */
async function migrateBacklog(kind, {
  dryRun = false,
  max = Infinity,
  minFreeBytes = 20 * 1024 ** 3,
  batchSize = 50,
  concurrency = 2, // each file is held in memory up to 50 MB (about twice while encrypting)
  fetchBuffer = fetchMediaBuffer,
  saveBlob = (buf) => vaultStorage.encryptAndSaveBlob(buf),
  refresh = refreshAll,
  freeBytesOf = () => freeBytes(config.VAULT_STORAGE_DIR),
  log = console.log
} = {}) {
  const k = KINDS[kind];
  const db = getDb();
  const enqueue = createQueue({ maxActive: concurrency, maxQueued: batchSize });
  const result = { processed: 0, succeeded: 0, failed: 0, stoppedFor: null };
  let lastId = Number.MAX_SAFE_INTEGER;

  while (result.processed < max) {
    if (!dryRun && freeBytesOf() < minFreeBytes) {
      result.stoppedFor = `less than ${Math.round(minFreeBytes / 1024 ** 3)} GB free on the vault disk`;
      break;
    }
    const rows = db.prepare(`
      SELECT * FROM ${k.table}
      WHERE (blob_id IS NULL OR blob_id = '') AND id < ? ${k.extraWhere}
      ORDER BY id DESC LIMIT ?
    `).all(lastId, Math.min(batchSize, max - result.processed)).map(k.format);
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1].id;

    const discordUrls = rows.map((r) => r[k.urlField]).filter((u) => DISCORD_HOST.test(u || ''));
    let fresh = {};
    if (discordUrls.length > 0 && !dryRun) fresh = await refresh(discordUrls);

    await Promise.all(rows.map((row) => enqueue(async () => {
      result.processed++;
      const url = fresh[row[k.urlField]] || row[k.urlField];
      try {
        if (!url || !url.startsWith('http')) throw new Error('no usable URL');
        if (dryRun) { result.succeeded++; return; }
        const { blobId } = await saveBlob(await fetchBuffer(url));
        k.save(row.id, blobId);
        result.succeeded++;
      } catch (err) {
        result.failed++;
        log(`[Backlog] ${kind} #${row.id} skipped: ${err.message}`);
      }
    })));
    log(`[Backlog] ${kind}: ${result.processed} done (${result.succeeded} ok, ${result.failed} skipped)`);
  }
  return result;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
  const type = opt('--type', 'all');
  const options = {
    dryRun: args.includes('--dry-run'),
    max: opt('--max') ? parseInt(opt('--max'), 10) : Infinity,
    minFreeBytes: parseFloat(opt('--min-free-gb', '20')) * 1024 ** 3
  };
  (async () => {
    try {
      for (const kind of type === 'all' ? ['images', 'clips'] : [type]) {
        if (!KINDS[kind]) throw new Error(`unknown --type ${type}`);
        console.log(`[Backlog] ${kind}`, await migrateBacklog(kind, options));
      }
      closeDb();
    } catch (err) {
      console.error('[Backlog] fatal:', err);
      process.exit(1);
    }
  })();
}

module.exports = { migrateBacklog, refreshAll };
