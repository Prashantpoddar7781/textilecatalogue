import { PrismaClient } from '@prisma/client';
import { migratePendingDesignImages } from '../utils/designImages.js';

const prisma = new PrismaClient();

try {
  const migrated = await migratePendingDesignImages(prisma);
  console.log(`Done. Migrated ${migrated} design(s).`);
} catch (error) {
  console.error('Image migration failed:', error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
