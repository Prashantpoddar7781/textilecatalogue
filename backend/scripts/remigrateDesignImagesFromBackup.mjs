/**
 * Re-upload design photos at FULL_MAX_EDGE (currently 4096px) using originals from a
 * Railway backup/restored Postgres, without overwriting live ERP data.
 *
 * Usage on Railway backend (or locally with both URLs set):
 *   BACKUP_DATABASE_URL="postgresql://..." DATABASE_URL="postgresql://..." node scripts/remigrateDesignImagesFromBackup.mjs
 *
 * BACKUP_DATABASE_URL = restored sibling DB from before today's R2 migration
 * DATABASE_URL        = live production DB (only Design image fields are updated)
 */
import { PrismaClient } from '@prisma/client';
import {
  isEmbeddedImage,
  isPublicImageUrl,
  persistDesignMedia
} from '../utils/designImages.js';
import { isR2Configured } from '../services/r2Storage.js';

const backupUrl = (process.env.BACKUP_DATABASE_URL || '').trim();
const liveUrl = (process.env.DATABASE_URL || '').trim();

if (!backupUrl) {
  console.error('Set BACKUP_DATABASE_URL to the restored Postgres (pre-migration backup).');
  process.exit(1);
}
if (!liveUrl) {
  console.error('Set DATABASE_URL to the live production Postgres.');
  process.exit(1);
}
if (backupUrl === liveUrl) {
  console.error('BACKUP_DATABASE_URL and DATABASE_URL must be different databases.');
  process.exit(1);
}
if (!isR2Configured()) {
  console.error('R2 env vars must be set (same as production).');
  process.exit(1);
}

const backup = new PrismaClient({ datasources: { db: { url: backupUrl } } });
const live = new PrismaClient({ datasources: { db: { url: liveUrl } } });

function backupHasOriginal(design) {
  return isEmbeddedImage(design.image)
    || (Array.isArray(design.aiModels) && design.aiModels.some((item) => isEmbeddedImage(item)));
}

try {
  let upgraded = 0;
  let skipped = 0;
  let missing = 0;
  let lastId = '';

  for (;;) {
    const batch = await backup.design.findMany({
      where: lastId ? { id: { gt: lastId } } : undefined,
      orderBy: { id: 'asc' },
      take: 1,
      select: {
        id: true,
        userId: true,
        image: true,
        aiModels: true
      }
    });
    if (!batch.length) break;

    const source = batch[0];
    lastId = source.id;

    if (!backupHasOriginal(source)) {
      skipped += 1;
      continue;
    }

    const target = await live.design.findUnique({
      where: { id: source.id },
      select: {
        id: true,
        userId: true,
        image: true,
        imageThumb: true,
        imageFull: true,
        aiModels: true
      }
    });

    if (!target) {
      missing += 1;
      console.warn(`Live DB missing design ${source.id}; skipped`);
      continue;
    }

    try {
      const fields = await persistDesignMedia({
        userId: target.userId || source.userId,
        designId: source.id,
        image: isEmbeddedImage(source.image) ? source.image : undefined,
        aiModels: Array.isArray(source.aiModels) ? source.aiModels : undefined,
        // Force re-upload: do not treat current live R2 URL as "already same image"
        previous: {
          image: null,
          imageFull: null,
          imageThumb: null
        }
      });

      if (!Object.keys(fields).length) {
        skipped += 1;
        continue;
      }

      await live.design.update({
        where: { id: source.id },
        data: fields
      });
      upgraded += 1;
      const full = fields.imageFull || fields.image || '';
      console.log(
        `Upgraded ${source.id} (${upgraded})`
        + (isPublicImageUrl(full) ? ` -> ${full}` : '')
      );
    } catch (error) {
      console.error(`Failed ${source.id}:`, error.message);
    }
  }

  console.log(JSON.stringify({ upgraded, skipped, missing }, null, 2));
} finally {
  await Promise.all([backup.$disconnect(), live.$disconnect()]);
}
