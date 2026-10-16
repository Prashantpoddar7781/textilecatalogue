-- GSTR-2B / 2A statements uploaded for ITC matching (one per user, return month and source).
CREATE TABLE IF NOT EXISTS "GstPortalStatement" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "fileName" TEXT,
  "rows" JSONB NOT NULL,
  "rowCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GstPortalStatement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GstPortalStatement_userId_period_source_key"
  ON "GstPortalStatement"("userId", "period", "source");
CREATE INDEX IF NOT EXISTS "GstPortalStatement_userId_idx" ON "GstPortalStatement"("userId");

DO $$ BEGIN
  ALTER TABLE "GstPortalStatement" ADD CONSTRAINT "GstPortalStatement_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
