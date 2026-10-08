const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');

// Security: Enforce strict alphanumeric regex for blob IDs to prevent path traversal
const SAFE_BLOB_ID_REGEX = /^[a-zA-Z0-9_\-]{8,128}$/;
const MAGIC_HEADER = Buffer.from('AVENC1', 'utf8'); // 6 bytes
const HEADER_SIZE = 34; // 6B Magic + 12B IV + 16B Auth Tag

// Cache derived 256-bit vault encryption key
let cachedVaultKey = null;

function getVaultKey(rawKey = config.VAULT_ENCRYPTION_KEY) {
  if (cachedVaultKey) return cachedVaultKey;
  if (!rawKey) {
    throw new Error('[VaultStorage] Missing vault encryption key');
  }
  // Derive dedicated 32-byte key using HMAC-SHA256 with domain separation
  cachedVaultKey = crypto.createHmac('sha256', Buffer.from(String(rawKey), 'utf8'))
    .update('asikvestel:vault:aes-256-gcm:v1', 'utf8')
    .digest();
  return cachedVaultKey;
}

function getStorageDir() {
  const dir = config.VAULT_STORAGE_DIR || path.resolve(__dirname, '../../data/vault_blobs');
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    } catch (err) {
      console.warn(`[VaultStorage] Failed to create ${dir}, falling back to local data directory:`, err.message);
      const fallbackDir = path.resolve(__dirname, '../../data/vault_blobs');
      fs.mkdirSync(fallbackDir, { recursive: true, mode: 0o700 });
      return fallbackDir;
    }
  }
  return dir;
}

function resolveBlobPath(blobId) {
  if (!blobId || typeof blobId !== 'string' || !SAFE_BLOB_ID_REGEX.test(blobId)) {
    throw new Error(`[VaultStorage] Invalid blob ID format: ${String(blobId)}`);
  }
  const storageDir = path.resolve(getStorageDir());
  const targetPath = path.resolve(storageDir, `${blobId}.enc`);

  // Path traversal defense-in-depth check
  if (!targetPath.startsWith(storageDir + path.sep)) {
    throw new Error('[VaultStorage] Path traversal detected');
  }
  return targetPath;
}

function computeBlobId(buffer) {
  if (!Buffer.isBuffer(buffer)) {
    buffer = Buffer.from(buffer);
  }
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Encrypts a binary buffer in memory using AES-256-GCM and writes to disk.
 * Strictly zero-plaintext on disk: writes [Magic (6B)][IV (12B)][Auth Tag (16B)][Ciphertext].
 * Uses atomic rename to prevent partial writes.
 */
async function encryptAndSaveBlob(buffer, explicitBlobId = null) {
  if (!Buffer.isBuffer(buffer)) {
    buffer = Buffer.from(buffer);
  }

  const blobId = explicitBlobId || computeBlobId(buffer);
  const targetPath = resolveBlobPath(blobId);
  const tempPath = `${targetPath}.${crypto.randomBytes(6).toString('hex')}.tmp`;

  const key = getVaultKey();
  const iv = crypto.randomBytes(12); // Cryptographically secure random 96-bit IV
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const ciphertext = Buffer.concat([cipher.update(buffer), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16-byte GCM authentication tag

  const encryptedBlob = Buffer.concat([MAGIC_HEADER, iv, authTag, ciphertext]);

  // Atomic write to prevent partial/corrupt blob files
  await fs.promises.writeFile(tempPath, encryptedBlob, { mode: 0o600 });
  await fs.promises.rename(tempPath, targetPath);

  return {
    blobId,
    path: targetPath,
    bytesWritten: encryptedBlob.length,
    originalSize: buffer.length
  };
}

/**
 * Creates a stream that decrypts the AES-256-GCM blob on-the-fly directly into the consumer.
 * Plaintext is NEVER stored on disk or cached; it streams from RAM directly into HTTP response.
 */
function createDecryptedStream(blobId) {
  const filePath = resolveBlobPath(blobId);
  if (!fs.existsSync(filePath)) {
    const notFoundErr = new Error(`Blob not found: ${blobId}`);
    notFoundErr.code = 'ENOENT';
    throw notFoundErr;
  }

  // Read header synchronously to extract IV and Auth Tag
  const fd = fs.openSync(filePath, 'r');
  const headerBuf = Buffer.alloc(HEADER_SIZE);
  try {
    const bytesRead = fs.readSync(fd, headerBuf, 0, HEADER_SIZE, 0);
    if (bytesRead < HEADER_SIZE) {
      throw new Error(`Corrupted blob header (read ${bytesRead}/${HEADER_SIZE} bytes)`);
    }
  } finally {
    fs.closeSync(fd);
  }

  const magic = headerBuf.subarray(0, 6);
  if (!magic.equals(MAGIC_HEADER)) {
    throw new Error('Invalid vault blob header magic');
  }

  const iv = headerBuf.subarray(6, 18);
  const authTag = headerBuf.subarray(18, 34);

  const key = getVaultKey();
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const fileStream = fs.createReadStream(filePath, { start: HEADER_SIZE });

  fileStream.on('error', (err) => {
    decipher.destroy(err);
  });

  decipher.on('error', (err) => {
    fileStream.destroy(err);
  });

  return fileStream.pipe(decipher);
}

/**
 * Decrypts a blob fully in memory and returns a Buffer.
 */
async function decryptBlob(blobId) {
  return new Promise((resolve, reject) => {
    try {
      const stream = createDecryptedStream(blobId);
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Deletes an encrypted blob from disk.
 */
function deleteBlob(blobId) {
  try {
    const filePath = resolveBlobPath(blobId);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (err) {
    console.warn(`[VaultStorage] Failed to delete blob ${blobId}:`, err.message);
  }
  return false;
}

function hasBlob(blobId) {
  try {
    const filePath = resolveBlobPath(blobId);
    return fs.existsSync(filePath);
  } catch {
    return false;
  }
}

module.exports = {
  getVaultKey,
  getStorageDir,
  resolveBlobPath,
  computeBlobId,
  encryptAndSaveBlob,
  createDecryptedStream,
  decryptBlob,
  deleteBlob,
  hasBlob,
  HEADER_SIZE,
  MAGIC_HEADER
};
