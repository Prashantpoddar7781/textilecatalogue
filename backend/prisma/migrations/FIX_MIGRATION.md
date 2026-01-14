# Fix Migration for Existing Data

## Problem
The migration fails because we're adding a required `basePrice` column to a table that already has 7 rows.

## Solution
We need to:
1. Make `basePrice` nullable initially
2. Add the column
3. Populate it from existing `retailPrice` values
4. Optionally make it required later (or keep nullable for backward compatibility)

## Steps

### Option 1: Create Migration Manually (Recommended)

1. Create the migration file manually:
```bash
cd backend
npx prisma migrate dev --create-only --name add_flexible_pricing_and_share_links
```

2. Edit the generated migration file in `backend/prisma/migrations/[timestamp]_add_flexible_pricing_and_share_links/migration.sql`

3. Replace the content with this:

```sql
-- AlterTable: Add basePrice as nullable
ALTER TABLE "Design" ADD COLUMN "basePrice" DOUBLE PRECISION;

-- Populate basePrice from retailPrice for existing rows
UPDATE "Design" SET "basePrice" = "retailPrice" WHERE "basePrice" IS NULL;

-- AlterTable: Add additionalPrices as JSON (nullable)
ALTER TABLE "Design" ADD COLUMN "additionalPrices" JSONB;

-- CreateTable: ShareLink
CREATE TABLE "ShareLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "selectedPriceType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShareLink_token_key" ON "ShareLink"("token");

-- CreateIndex
CREATE INDEX "ShareLink_userId_idx" ON "ShareLink"("userId");

-- CreateIndex
CREATE INDEX "ShareLink_designId_idx" ON "ShareLink"("designId");

-- CreateIndex
CREATE INDEX "ShareLink_token_idx" ON "ShareLink"("token");

-- CreateIndex
CREATE INDEX "ShareLink_isActive_idx" ON "ShareLink"("isActive");

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;
```

4. Apply the migration:
```bash
npx prisma migrate dev
```

### Option 2: Use Prisma's Migration Tool (Simpler)

Since we've made `basePrice` nullable in the schema, you can now run:

```bash
cd backend
npx prisma migrate dev --name add_flexible_pricing_and_share_links
```

Then manually update existing rows:

```bash
# Connect to your database and run:
# UPDATE "Design" SET "basePrice" = "retailPrice" WHERE "basePrice" IS NULL;
```

Or use Prisma Studio:
```bash
npx prisma studio
```

Then manually update the basePrice values in the UI.

### Option 3: Use SQL Directly

If you have direct database access:

```sql
-- Add basePrice as nullable
ALTER TABLE "Design" ADD COLUMN IF NOT EXISTS "basePrice" DOUBLE PRECISION;

-- Populate from retailPrice
UPDATE "Design" SET "basePrice" = "retailPrice" WHERE "basePrice" IS NULL;

-- Add additionalPrices
ALTER TABLE "Design" ADD COLUMN IF NOT EXISTS "additionalPrices" JSONB;

-- Then run the Prisma migration for ShareLink table only
```
