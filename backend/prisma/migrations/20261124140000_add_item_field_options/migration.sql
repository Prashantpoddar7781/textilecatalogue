-- Quality Information dropdowns (packing, category, screen series, and the rest).
CREATE TABLE IF NOT EXISTS "ItemFieldOption" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "field" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ItemFieldOption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ItemFieldOption_userId_field_name_key" ON "ItemFieldOption"("userId", "field", "name");
CREATE INDEX IF NOT EXISTS "ItemFieldOption_userId_field_idx" ON "ItemFieldOption"("userId", "field");
DO $$ BEGIN
  ALTER TABLE "ItemFieldOption" ADD CONSTRAINT "ItemFieldOption_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
