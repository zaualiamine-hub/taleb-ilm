const crypto = require('crypto');
const ALGO = 'aes-256-gcm';

function getKey() {
  const raw = process.env.ENCRYPTION_KEY || 'default-dev-key-change-me-32chr!!';
  return crypto.createHash('sha256').update(String(raw)).digest();
}

function encrypt(plainText) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decrypt(payload) {
  try {
    const key = getKey();
    const buf = Buffer.from(payload, 'base64');
    const iv = buf.subarray(0, 12);
    const authTag = buf.subarray(12, 28);
    const encrypted = buf.subarray(28);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch (e) {
    return '⚠️ تعذّر فك تشفير هذه الرسالة';
  }
}

module.exports = { encrypt, decrypt };
