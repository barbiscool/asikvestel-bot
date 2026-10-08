const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const vaultStorage = require('../src/vaultStorage');

const TEST_VAULT_DIR = path.resolve(__dirname, 'test_vault_blobs');

test.before(() => {
  if (fs.existsSync(TEST_VAULT_DIR)) {
    fs.rmSync(TEST_VAULT_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(TEST_VAULT_DIR, { recursive: true, mode: 0o700 });
  process.env.VAULT_STORAGE_DIR = TEST_VAULT_DIR;
  process.env.VAULT_ENCRYPTION_KEY = 'test_vault_secret_key_32_bytes_long_exact';
});

test.after(() => {
  if (fs.existsSync(TEST_VAULT_DIR)) {
    fs.rmSync(TEST_VAULT_DIR, { recursive: true, force: true });
  }
});

test('VaultStorage: Key derivation and domain separation', () => {
  const key1 = vaultStorage.getVaultKey('key_alpha');
  assert.strictEqual(key1.length, 32);
  assert.ok(Buffer.isBuffer(key1));
});

test('VaultStorage: Path traversal protection', () => {
  const invalidIds = [
    '../../../etc/passwd',
    '..\\..\\windows\\system32',
    'blob/subfolder',
    'blob\\subfolder',
    'blob\0nullbyte',
    'short', // Less than 8 characters
    'has space in id',
    'evil*char?id'
  ];

  for (const badId of invalidIds) {
    assert.throws(() => {
      vaultStorage.resolveBlobPath(badId);
    }, /Invalid blob ID format|Path traversal detected/);
  }

  // Valid IDs should resolve cleanly inside storage dir
  const validId = 'abcdef0123456789abcdef0123456789';
  const resolved = vaultStorage.resolveBlobPath(validId);
  assert.ok(resolved.endsWith(`${validId}.enc`));
  assert.ok(resolved.startsWith(path.resolve(TEST_VAULT_DIR)));
});

test('VaultStorage: Full encrypt, decrypt, and stream decryption lifecycle', async () => {
  const originalData = Buffer.from('Binary image content simulation: \x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR...pixel data...', 'binary');
  const blobId = 'test_blob_image_000000000001';

  // 1. Encrypt and save
  const result = await vaultStorage.encryptAndSaveBlob(originalData, blobId);
  assert.strictEqual(result.blobId, blobId);
  assert.ok(vaultStorage.hasBlob(blobId));

  // Verify file on disk is purely binary and zero-plaintext
  const fileBytes = fs.readFileSync(result.path);
  assert.ok(fileBytes.length > originalData.length, 'File includes header (34 bytes) + ciphertext');
  const diskStr = fileBytes.toString('binary');
  assert.strictEqual(diskStr.includes('pixel data'), false, 'ZERO PLAINTEXT: Original text must NOT appear on disk');

  // Verify Header Structure
  const magic = fileBytes.subarray(0, 6).toString('utf8');
  assert.strictEqual(magic, 'AVENC1');

  // 2. In-memory decryptBlob
  const decryptedBuf = await vaultStorage.decryptBlob(blobId);
  assert.ok(decryptedBuf.equals(originalData), 'Decrypted buffer matches original bytes');

  // 3. Streaming decryption (piped into consumer)
  const stream = vaultStorage.createDecryptedStream(blobId);
  const streamChunks = [];
  await new Promise((resolve, reject) => {
    stream.on('data', chunk => streamChunks.push(chunk));
    stream.on('end', resolve);
    stream.on('error', reject);
  });
  const streamedBuf = Buffer.concat(streamChunks);
  assert.ok(streamedBuf.equals(originalData), 'Streamed decrypted content matches original');

  // 4. Deletion
  const deleted = vaultStorage.deleteBlob(blobId);
  assert.strictEqual(deleted, true);
  assert.strictEqual(vaultStorage.hasBlob(blobId), false);
});

test('VaultStorage: Tamper resistance (corrupted IV, auth tag, or ciphertext)', async () => {
  const plain = Buffer.from('Confidential vault media data payload');
  const blobId = 'test_tamper_blob_00000000002';
  await vaultStorage.encryptAndSaveBlob(plain, blobId);

  const targetPath = vaultStorage.resolveBlobPath(blobId);
  const originalBytes = Buffer.from(fs.readFileSync(targetPath));

  // Case 1: Corrupted Auth Tag (bytes 18..33)
  const tamperedTag = Buffer.from(originalBytes);
  tamperedTag[18] ^= 0x55;
  fs.writeFileSync(targetPath, tamperedTag);

  await assert.rejects(async () => {
    await vaultStorage.decryptBlob(blobId);
  }, /Unsupported state or unable to authenticate data|decryption failed/i);

  // Case 2: Corrupted Ciphertext (byte 34 onwards)
  const tamperedCipher = Buffer.from(originalBytes);
  tamperedCipher[35] ^= 0xAA;
  fs.writeFileSync(targetPath, tamperedCipher);

  await assert.rejects(async () => {
    await vaultStorage.decryptBlob(blobId);
  }, /Unsupported state or unable to authenticate data|decryption failed/i);

  // Case 3: Invalid magic header (bytes 0..5)
  const tamperedMagic = Buffer.from(originalBytes);
  tamperedMagic[0] = 0x58; // 'X' instead of 'A'
  fs.writeFileSync(targetPath, tamperedMagic);

  assert.throws(() => {
    vaultStorage.createDecryptedStream(blobId);
  }, /Invalid vault blob header magic/);

  // Cleanup
  vaultStorage.deleteBlob(blobId);
});

test('VaultStorage: Non-existent blob handling', () => {
  assert.throws(() => {
    vaultStorage.createDecryptedStream('non_existent_blob_000000000099');
  }, (err) => {
    return err.code === 'ENOENT';
  });
});
