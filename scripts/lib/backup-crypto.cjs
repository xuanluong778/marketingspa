'use strict';
/**
 * AES-256-GCM encrypt/decrypt for offsite backup blobs.
 * Key file is 32-byte hex (64 chars). Never prints the key.
 */
const fs = require('fs');
const crypto = require('crypto');

const MAGIC = Buffer.from('MAAZ1');

function loadKey(keyPath) {
  const p = keyPath || process.env.BACKUP_ENCRYPTION_KEY_FILE;
  if (!p) throw new Error('BACKUP_ENCRYPTION_KEY_FILE missing');
  const raw = fs.readFileSync(p, 'utf8').trim();
  const buf = Buffer.from(raw, 'hex');
  if (buf.length !== 32) throw new Error('backup key must be 32-byte hex');
  return buf;
}

function encryptFile(src, dest, keyPath) {
  const key = loadKey(keyPath);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plain = fs.readFileSync(src);
  const enc = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  fs.writeFileSync(dest, Buffer.concat([MAGIC, iv, tag, enc]));
  return dest;
}

function decryptFile(src, dest, keyPath) {
  const key = loadKey(keyPath);
  const blob = fs.readFileSync(src);
  if (blob.length < MAGIC.length + 12 + 16 + 1) throw new Error('ciphertext too small');
  if (!blob.subarray(0, MAGIC.length).equals(MAGIC)) throw new Error('unknown backup envelope');
  const iv = blob.subarray(MAGIC.length, MAGIC.length + 12);
  const tag = blob.subarray(MAGIC.length + 12, MAGIC.length + 28);
  const enc = blob.subarray(MAGIC.length + 28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(enc), decipher.final()]);
  fs.writeFileSync(dest, plain);
  return dest;
}

function sha256File(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

module.exports = { encryptFile, decryptFile, loadKey, sha256File };

if (require.main === module) {
  const [cmd, src, dest] = process.argv.slice(2);
  if (cmd === 'encrypt') encryptFile(src, dest);
  else if (cmd === 'decrypt') decryptFile(src, dest);
  else {
    console.error('Usage: backup-crypto.cjs encrypt|decrypt <src> <dest>');
    process.exit(2);
  }
}
