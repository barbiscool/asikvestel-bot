const test = require('node:test');
const assert = require('node:assert');
const { encrypt, decrypt, isEncrypted, deriveKey } = require('../src/crypto');

test('Crypto: AES-256-GCM encryption, decryption, determinism, and key derivation', () => {
  const secretKey = 'test_secret_encryption_key_12345';
  const original = 'https://cdn.discordapp.com/attachments/123456789/987654321/clip.mp4?ex=abc&is=xyz';

  // 1. Basic encrypt & decrypt cycle
  const encrypted = encrypt(original, secretKey);
  assert.notStrictEqual(encrypted, original);
  assert.ok(isEncrypted(encrypted), 'Should be marked as encrypted');
  assert.ok(encrypted.startsWith('enc:v1:'), 'Should start with enc:v1:');
  assert.strictEqual(decrypt(encrypted, secretKey), original);

  // 2. Determinism for SQLite UNIQUE constraints
  const url1 = 'https://cdn.discordapp.com/attachments/111/222/video.mp4';
  const url2 = 'https://cdn.discordapp.com/attachments/111/222/video.mp4';
  const url3 = 'https://cdn.discordapp.com/attachments/111/333/different.mp4';
  assert.strictEqual(encrypt(url1, secretKey), encrypt(url2, secretKey));
  assert.notStrictEqual(encrypt(url1, secretKey), encrypt(url3, secretKey));

  // 3. Key derivation consistency
  const key1 = deriveKey('my-short-pass');
  const key2 = deriveKey('my-short-pass');
  const key3 = deriveKey('different-pass');
  assert.strictEqual(key1.length, 32);
  assert.ok(key1.equals(key2));
  assert.ok(!key1.equals(key3));
});

test('Crypto: edge cases (null, empty, pass-through, and tamper resistance)', () => {
  const secretKey = 'key';

  // 1. Null / Empty handling
  assert.strictEqual(encrypt('', secretKey), '');
  assert.strictEqual(encrypt(null, secretKey), null);
  assert.strictEqual(encrypt(undefined, secretKey), undefined);
  assert.strictEqual(decrypt('', secretKey), '');
  assert.strictEqual(decrypt(null, secretKey), null);
  assert.strictEqual(decrypt(undefined, secretKey), undefined);

  // 2. Legacy unencrypted pass-through
  const plain = 'https://cdn.discordapp.com/attachments/plain.mp4';
  assert.strictEqual(isEncrypted(plain), false);
  assert.strictEqual(decrypt(plain, secretKey), plain);

  // 3. Tamper detection
  const enc = encrypt('sensitive_message_link', secretKey);
  const parts = enc.split(':');
  parts[4] = (parts[4].startsWith('0') ? '1' : '0') + parts[4].slice(1);
  const tampered = parts.join(':');
  assert.throws(() => {
    decrypt(tampered, secretKey);
  }, /Unsupported state or unable to authenticate data|tampered|decryption failed/i);
});
