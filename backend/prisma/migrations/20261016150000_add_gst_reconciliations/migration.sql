-- Bills saved as reconciled from GSTR-2A / 2B matching.
CREATE TABLE IF NOT EXISTS "GstReconciliation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "period" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "bookIds" JSONB NOT NULL,
  "portalKey" TEXT,
  "gstin" TEXT,
  "partyName" TEXT,
  "billNo" TEXT,
  "billDate" TEXT,
  "portalDocNo" TEXT,
  "portalDate" TEXT,
  "bookTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "portalTax" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GstReconciliation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "GstReconciliation_userId_idx" ON "GstReconciliation"("userId");
CREATE INDEX IF NOT EXISTS "GstReconciliation_userId_period_idx" ON "GstReconciliation"("userId", "period");

DO $$ BEGIN
  ALTER TABLE "GstReconciliation" ADD CONSTRAINT "GstReconciliation_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
