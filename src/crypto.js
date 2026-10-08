const crypto = require('crypto');

// Cache derived keys to avoid redundant SHA-256 hashing and conserve CPU/RAM
const keyCache = new Map();

function deriveKey(rawKey) {
  if (!rawKey) {
    throw new Error('Encryption key must not be empty');
  }
  if (Buffer.isBuffer(rawKey) && rawKey.length === 32) {
    return rawKey;
  }
  const keyStr = String(rawKey);
  if (keyCache.has(keyStr)) {
    return keyCache.get(keyStr);
  }
  let derived;
  if (/^[0-9a-fA-F]{64}$/.test(keyStr)) {
    derived = Buffer.from(keyStr, 'hex');
  } else {
    derived = crypto.createHash('sha256').update(keyStr, 'utf8').digest();
  }
  keyCache.set(keyStr, derived);
  return derived;
}

function isEncrypted(str) {
  return typeof str === 'string' && str.startsWith('enc:v1:');
}

/**
 * Encrypts plaintext using AES-256-GCM.
 * Uses deterministic IV derived from HMAC-SHA256(key, plaintext) to ensure:
 * 1. Identical inputs produce identical ciphertext, allowing SQLite UNIQUE indexes (e.g. media_url) to work properly.
 * 2. Authenticated encryption (GCM) prevents tampering.
 * 3. Low memory and minimal CPU overhead.
 */
function encrypt(text, rawKey) {
  if (text === null || text === undefined || text === '') {
    return text;
  }
  if (typeof text !== 'string') {
    text = String(text);
  }
  if (isEncrypted(text)) {
    return text;
  }
  const key = deriveKey(rawKey);

  // 12-byte IV deterministically generated via HMAC-SHA256
  const iv = crypto.createHmac('sha256', key).update(text, 'utf8').digest().subarray(0, 12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `enc:v1:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts AES-256-GCM ciphertext.
 * If text is not encrypted (does not start with enc:v1:), returns it as-is for backward compatibility.
 */
function decrypt(ciphertext, rawKey) {
  if (ciphertext === null || ciphertext === undefined || ciphertext === '') {
    return ciphertext;
  }
  if (typeof ciphertext !== 'string' || !isEncrypted(ciphertext)) {
    return ciphertext;
  }
  const parts = ciphertext.split(':');
  // Format: enc : v1 : <iv_hex> : <authTag_hex> : <encrypted_hex>
  if (parts.length !== 5 || parts[0] !== 'enc' || parts[1] !== 'v1') {
    throw new Error('Invalid encrypted data format');
  }

  const iv = Buffer.from(parts[2], 'hex');
  const authTag = Buffer.from(parts[3], 'hex');
  const encryptedBuf = Buffer.from(parts[4], 'hex');
  const key = deriveKey(rawKey);

  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encryptedBuf), decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = {
  deriveKey,
  isEncrypted,
  encrypt,
  decrypt
};
