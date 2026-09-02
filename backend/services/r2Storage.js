import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3';

function env(name) {
  return (process.env[name] || '').trim();
}

export function isR2Configured() {
  return Boolean(
    env('R2_ACCOUNT_ID') &&
    env('R2_ACCESS_KEY_ID') &&
    env('R2_SECRET_ACCESS_KEY') &&
    env('R2_BUCKET_NAME') &&
    env('R2_PUBLIC_BASE_URL')
  );
}

let client;

function getClient() {
  if (!isR2Configured()) {
    throw new Error('Cloudflare R2 is not configured');
  }
  if (!client) {
    client = new S3Client({
      region: 'auto',
      endpoint: `https://${env('R2_ACCOUNT_ID')}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env('R2_ACCESS_KEY_ID'),
        secretAccessKey: env('R2_SECRET_ACCESS_KEY')
      },
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED'
    });
  }
  return client;
}

export function r2PublicBaseUrl() {
  return env('R2_PUBLIC_BASE_URL').replace(/\/$/, '');
}

export function publicUrlForKey(key) {
  return `${r2PublicBaseUrl()}/${key}`;
}

export function keyFromPublicUrl(url) {
  if (!url || typeof url !== 'string') return null;
  const base = r2PublicBaseUrl();
  if (!base || !url.startsWith(base + '/')) return null;
  return decodeURIComponent(url.slice(base.length + 1).split('?')[0]);
}

export async function uploadObject({ key, body, contentType, cacheControl }) {
  const bucket = env('R2_BUCKET_NAME');
  await getClient().send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType || 'image/jpeg',
    CacheControl: cacheControl || 'public, max-age=31536000, immutable'
  }));
  return publicUrlForKey(key);
}

export async function deletePrefix(prefix) {
  if (!isR2Configured() || !prefix) return;
  const bucket = env('R2_BUCKET_NAME');
  const s3 = getClient();
  let token;
  do {
    const listed = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: token
    }));
    const objects = (listed.Contents || []).map((item) => ({ Key: item.Key })).filter((item) => item.Key);
    if (objects.length) {
      await s3.send(new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: objects }
      }));
    }
    token = listed.IsTruncated ? listed.NextContinuationToken : undefined;
  } while (token);
}

export async function deleteKeys(keys) {
  if (!isR2Configured()) return;
  const unique = [...new Set((keys || []).filter(Boolean))];
  if (!unique.length) return;
  await getClient().send(new DeleteObjectsCommand({
    Bucket: env('R2_BUCKET_NAME'),
    Delete: { Objects: unique.map((Key) => ({ Key })) }
  }));
}
