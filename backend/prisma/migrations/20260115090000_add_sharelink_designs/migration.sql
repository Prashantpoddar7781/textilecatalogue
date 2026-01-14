-- Make ShareLink.designId optional (for multi-design links)
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ShareLink' AND column_name = 'designId' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE "ShareLink" ALTER COLUMN "designId" DROP NOT NULL;
    END IF;
END $$;

-- Create ShareLinkDesign table for many-to-many relation
CREATE TABLE IF NOT EXISTS "ShareLinkDesign" (
    "id" TEXT NOT NULL,
    "shareLinkId" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShareLinkDesign_pkey" PRIMARY KEY ("id")
);

-- Create indexes (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ShareLinkDesign_shareLinkId_idx') THEN
        CREATE INDEX "ShareLinkDesign_shareLinkId_idx" ON "ShareLinkDesign"("shareLinkId");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ShareLinkDesign_designId_idx') THEN
        CREATE INDEX "ShareLinkDesign_designId_idx" ON "ShareLinkDesign"("designId");
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ShareLinkDesign_shareLinkId_designId_key') THEN
        CREATE UNIQUE INDEX "ShareLinkDesign_shareLinkId_designId_key" ON "ShareLinkDesign"("shareLinkId", "designId");
    END IF;
END $$;

-- Add foreign keys (if not exists)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ShareLinkDesign_shareLinkId_fkey') THEN
        ALTER TABLE "ShareLinkDesign" ADD CONSTRAINT "ShareLinkDesign_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "ShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ShareLinkDesign_designId_fkey') THEN
        ALTER TABLE "ShareLinkDesign" ADD CONSTRAINT "ShareLinkDesign_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- Backfill existing share links into ShareLinkDesign
INSERT INTO "ShareLinkDesign" ("id", "shareLinkId", "designId", "createdAt")
SELECT 
    md5(random()::text || clock_timestamp()::text),
    "id",
    "designId",
    NOW()
FROM "ShareLink"
WHERE "designId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "ShareLinkDesign" 
    WHERE "shareLinkId" = "ShareLink"."id" AND "designId" = "ShareLink"."designId"
  );
