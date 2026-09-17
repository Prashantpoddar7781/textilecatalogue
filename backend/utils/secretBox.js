import crypto from 'crypto';

/**
 * Small AES-256-GCM box for API secrets we must send back to a vendor in clear
 * (e-way bill GSP client secret / portal password), so they are not readable
 * straight out of a database dump.
 */
const PREFIX = 'enc:v1:';

function keyBytes() {
  const raw = process.env.SECRET_BOX_KEY || process.env.EWB_SECRET_KEY || process.env.JWT_SECRET || '';
  if (!raw) return null;
  return crypto.createHash('sha256').update(String(raw)).digest();
}

export function isEncrypted(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptSecret(plain) {
  const text = plain == null ? '' : String(plain);
  if (!text) return null;
  if (isEncrypted(text)) return text;
  const key = keyBytes();
  if (!key) return text;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString('base64')}:${tag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptSecret(stored) {
  if (!stored) return '';
  const text = String(stored);
  if (!isEncrypted(text)) return text;
  const key = keyBytes();
  if (!key) return '';
  const [, , ivPart, tagPart, dataPart] = text.split(':');
  if (!ivPart || !tagPart || !dataPart) return '';
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64'));
    decipher.setAuthTag(Buffer.from(tagPart, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataPart, 'base64')),
      decipher.final()
    ]).toString('utf8');
  } catch {
    return '';
  }
}

/** Never echo a secret back to the browser — only whether one is stored. */
export function secretHint(stored) {
  const plain = decryptSecret(stored);
  if (!plain) return '';
  if (plain.length <= 4) return '••••';
  return `••••${plain.slice(-4)}`;
}
