import sharp from 'sharp';
import { randomBytes } from 'crypto';
import {
  isR2Configured,
  uploadObject,
  deletePrefix,
  keyFromPublicUrl
} from '../services/r2Storage.js';

const IMAGE_JOB_LIMIT = 2;
let imageJobsActive = 0;
const imageJobWaiters = [];

async function withImageJobLock(fn) {
  if (imageJobsActive >= IMAGE_JOB_LIMIT) {
    await new Promise((resolve) => imageJobWaiters.push(resolve));
  }
  imageJobsActive += 1;
  try {
    return await fn();
  } finally {
    imageJobsActive -= 1;
    const next = imageJobWaiters.shift();
    if (next) next();
  }
}
// Near-camera quality for new uploads. List/grid still uses 480px thumbs, so
// catalogue scroll stays fast; only fullscreen / share download the full file.
const FULL_MAX_EDGE = 4096;
const THUMB_MAX_EDGE = 480;
const FULL_QUALITY = 95;
const THUMB_QUALITY = 70;
const MAX_INLINE_CHARS = 120000;

export const DESIGN_LIST_SELECT = {
  id: true,
  userId: true,
  catalogueId: true,
  name: true,
  imageThumb: true,
  imageFull: true,
  designCode: true,
  color: true,
  stockQuantity: true,
  stockUnit: true,
  pcsPerParcel: true,
  moq: true,
  basePrice: true,
  additionalPrices: true,
  costingDetails: true,
  wholesalePrice: true,
  retailPrice: true,
  fabric: true,
  description: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      id: true,
      name: true,
      email: true,
      firmName: true
    }
  },
  catalogue: {
    select: {
      id: true,
      name: true
    }
  }
};

export const DESIGN_PREVIEW_SELECT = {
  id: true,
  name: true,
  imageThumb: true,
  imageFull: true,
  fabric: true
};

export function isPublicImageUrl(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim());
}

export function isEmbeddedImage(value) {
  if (typeof value !== 'string' || !value) return false;
  if (value.startsWith('data:image')) return true;
  if (isPublicImageUrl(value)) return false;
  return value.length > 2000;
}

function safeInlineImage(value) {
  if (!value || typeof value !== 'string') return '';
  if (isPublicImageUrl(value)) return value.trim();
  if (value.startsWith('data:image') && value.length <= MAX_INLINE_CHARS) return value;
  return '';
}

function parseDataUrl(value) {
  const match = String(value).match(/^data:([^;]+);base64,(.+)$/s);
  if (match) {
    return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
  }
  if (/^[A-Za-z0-9+/=\s]+$/.test(value) && value.length > 2000) {
    return { mime: 'image/jpeg', buffer: Buffer.from(value, 'base64') };
  }
  return null;
}

async function bufferFromImageInput(value) {
  if (Buffer.isBuffer(value)) return value;
  if (typeof value !== 'string') return null;
  if (isPublicImageUrl(value)) {
    const response = await fetch(value);
    if (!response.ok) throw new Error(`Could not download image (${response.status})`);
    return Buffer.from(await response.arrayBuffer());
  }
  const parsed = parseDataUrl(value);
  return parsed?.buffer || null;
}

export async function processDesignImage(value) {
  return withImageJobLock(async () => {
    const input = await bufferFromImageInput(value);
    if (!input?.length) throw new Error('Invalid image data');

    const rotated = await sharp(input, { failOn: 'none' }).rotate().toBuffer();
    const full = await sharp(rotated)
      .resize({
        width: FULL_MAX_EDGE,
        height: FULL_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: FULL_QUALITY })
      .toBuffer();

    const thumb = await sharp(rotated)
      .resize({
        width: THUMB_MAX_EDGE,
        height: THUMB_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: THUMB_QUALITY })
      .toBuffer();

    return { full, thumb };
  });
}

function objectKey(userId, designId, name) {
  return `designs/${userId}/${designId}/${name}`;
}

function versionToken() {
  return randomBytes(4).toString('hex');
}

async function storeProcessedImage({ userId, designId, full, thumb, kind }) {
  const stamp = versionToken();
  if (isR2Configured()) {
    const fullKey = objectKey(userId, designId, `${kind}-${stamp}.jpg`);
    const thumbKey = objectKey(userId, designId, `${kind}-thumb-${stamp}.jpg`);
    const [fullUrl, thumbUrl] = await Promise.all([
      uploadObject({ key: fullKey, body: full, contentType: 'image/jpeg' }),
      uploadObject({ key: thumbKey, body: thumb, contentType: 'image/jpeg' })
    ]);
    return { fullUrl, thumbUrl };
  }

  return {
    fullUrl: null,
    thumbUrl: `data:image/jpeg;base64,${thumb.toString('base64')}`
  };
}

function collectR2Keys(design) {
  const values = [
    design?.image,
    design?.imageFull,
    design?.imageThumb,
    ...(Array.isArray(design?.aiModels) ? design.aiModels : [])
  ];
  return values.map(keyFromPublicUrl).filter(Boolean);
}

export async function persistDesignMedia({
  userId,
  designId,
  image,
  aiModels,
  previous
} = {}) {
  const fields = {};

  const incomingIsExistingThumb =
    image &&
    previous?.imageThumb &&
    image === previous.imageThumb;

  const incomingIsExistingFull =
    image &&
    (image === previous?.imageFull || image === previous?.image);

  // When previous.image/imageFull/imageThumb are explicitly null, force a fresh
  // encode+upload (used by backup remigration to current FULL_MAX_EDGE).
  const forceReupload = previous != null
    && previous.image === null
    && previous.imageFull === null
    && previous.imageThumb === null;

  if (
    image
    && !incomingIsExistingThumb
    && (
      forceReupload
      || isEmbeddedImage(image)
      || (isPublicImageUrl(image) && !incomingIsExistingFull)
    )
  ) {
    const { full, thumb } = await processDesignImage(image);
    const stored = await storeProcessedImage({
      userId,
      designId,
      full,
      thumb,
      kind: 'main'
    });
    if (stored.fullUrl) {
      fields.image = stored.fullUrl;
      fields.imageFull = stored.fullUrl;
    }
    if (stored.thumbUrl) fields.imageThumb = stored.thumbUrl;
  } else if (previous && !previous.imageThumb && previous.image) {
    const { full, thumb } = await processDesignImage(previous.image);
    const stored = await storeProcessedImage({
      userId,
      designId,
      full,
      thumb,
      kind: 'main'
    });
    if (stored.fullUrl) {
      fields.image = stored.fullUrl;
      fields.imageFull = stored.fullUrl;
    }
    if (stored.thumbUrl) fields.imageThumb = stored.thumbUrl;
  }

  if (Array.isArray(aiModels)) {
    const next = [];
    for (let i = 0; i < aiModels.length; i += 1) {
      const item = aiModels[i];
      if (!item) continue;
      if (isPublicImageUrl(item) && !isEmbeddedImage(item)) {
        next.push(item);
        continue;
      }
      if (!isEmbeddedImage(item) && !isPublicImageUrl(item)) continue;
      const { full, thumb } = await processDesignImage(item);
      const stored = await storeProcessedImage({
        userId,
        designId,
        full,
        thumb,
        kind: `ai-${i}`
      });
      next.push(stored.fullUrl || stored.thumbUrl);
    }
    fields.aiModels = next.length ? next : null;
  }

  return fields;
}

function presentAiModels(aiModels, { allowEmbedded = false } = {}) {
  if (!Array.isArray(aiModels)) return undefined;
  if (allowEmbedded) return aiModels;
  const urls = aiModels.map(safeInlineImage).filter(Boolean);
  return urls.length ? urls : [];
}

export function presentDesign(design, { variant = 'full' } = {}) {
  if (!design) return design;
  const thumb = safeInlineImage(design.imageThumb);
  const fullFromUrl = safeInlineImage(design.imageFull) || (isPublicImageUrl(design.image) ? design.image.trim() : '');
  const full = variant === 'full' && !fullFromUrl && isEmbeddedImage(design.image)
    ? design.image
    : fullFromUrl;
  const display = variant === 'list' ? (thumb || fullFromUrl) : (full || thumb);
  return {
    ...design,
    image: display,
    imageThumb: thumb || undefined,
    imageFull: fullFromUrl || (variant === 'full' && !isEmbeddedImage(display) ? display : undefined) || thumb || undefined,
    aiModels: presentAiModels(design.aiModels, { allowEmbedded: variant === 'full' })
  };
}

export function presentDesignPreview(design) {
  if (!design) return design;
  const presented = presentDesign(design, { variant: 'list' });
  return {
    id: presented.id,
    name: presented.name,
    image: presented.image,
    imageThumb: presented.imageThumb,
    imageFull: presented.imageFull,
    fabric: presented.fabric
  };
}

export function publicImageRef(value) {
  return safeInlineImage(value);
}

export async function deleteDesignMedia(design) {
  if (!design?.userId || !design?.id) return;
  try {
    await deletePrefix(`designs/${design.userId}/${design.id}/`);
  } catch (error) {
    const keys = collectR2Keys(design);
    if (keys.length) {
      const { deleteKeys } = await import('../services/r2Storage.js');
      await deleteKeys(keys);
    } else {
      console.warn('Failed to delete design images from R2:', error.message);
    }
  }
}

function needsMigration(design) {
  const thumbOk = Boolean(safeInlineImage(design.imageThumb));
  const imageStillEmbedded = isEmbeddedImage(design.image);
  const aiNeedsWork = Array.isArray(design.aiModels) && design.aiModels.some((item) => isEmbeddedImage(item));
  if (isR2Configured()) {
    return imageStillEmbedded || !isPublicImageUrl(design.imageThumb || '') || !isPublicImageUrl(design.imageFull || design.image || '') || aiNeedsWork;
  }
  return !thumbOk || aiNeedsWork;
}

export async function migratePendingDesignImages(prisma, { limit = Infinity } = {}) {
  let migrated = 0;
  let lastId = '';
  while (migrated < limit) {
    const batch = await prisma.design.findMany({
      where: lastId ? { id: { gt: lastId } } : undefined,
      orderBy: { id: 'asc' },
      take: 1
    });
    if (!batch.length) break;
    const design = batch[0];
    lastId = design.id;
    if (!needsMigration(design)) continue;
    try {
      const fields = await persistDesignMedia({
        userId: design.userId,
        designId: design.id,
        image: design.image,
        aiModels: Array.isArray(design.aiModels) ? design.aiModels : undefined,
        previous: design
      });
      if (Object.keys(fields).length) {
        await prisma.design.update({
          where: { id: design.id },
          data: fields
        });
        migrated += 1;
        console.log(`Migrated design images ${design.id} (${migrated})`);
      }
    } catch (error) {
      console.error(`Failed to migrate design ${design.id}:`, error.message);
    }
  }
  return migrated;
}

let migrationStarted = false;

export function startDesignImageMigration(prisma) {
  if (migrationStarted) return;
  migrationStarted = true;
  if (isR2Configured()) {
    console.log('Cloudflare R2 image storage is configured');
  } else {
    console.warn('Cloudflare R2 is not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME, R2_PUBLIC_BASE_URL. Lists will still load thumbnails; full photos stay in Postgres until R2 is set.');
  }
  setTimeout(() => {
    migratePendingDesignImages(prisma)
      .then((count) => {
        if (count) console.log(`Design image migration finished: ${count} updated`);
        else console.log('Design image migration: nothing pending');
      })
      .catch((error) => {
        console.error('Design image migration failed:', error);
      });
  }, 5000);
}

export async function jpegForDesign(design, kind = 'thumb') {
  const preferred = kind === 'full'
    ? (design.imageFull || design.image || design.imageThumb)
    : (design.imageThumb || design.imageFull || design.image);
  if (!preferred || preferred === 'uploading') {
    throw new Error('No image available');
  }
  if (isPublicImageUrl(preferred)) return { redirect: preferred };
  const { full, thumb } = await processDesignImage(preferred);
  return { buffer: kind === 'full' ? full : thumb };
}
