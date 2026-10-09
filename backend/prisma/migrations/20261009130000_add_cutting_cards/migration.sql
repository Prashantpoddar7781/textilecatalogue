-- Saved cutting-cost cards. The calculator reads grey dispatch + mill receipt; this stores the fresh-saree qty and the cost snapshot.
CREATE TABLE IF NOT EXISTS "CuttingCard" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "companyName" TEXT,
  "greyDispatchId" TEXT,
  "millReceiptId" TEXT,
  "cutCardNo" TEXT NOT NULL,
  "recCardNo" TEXT,
  "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "millName" TEXT,
  "lotNo" TEXT,
  "weaverName" TEXT,
  "quality" TEXT,
  "greyMts" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "greyRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "greyAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "finMts" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "jobRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "jobAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "freshSarees" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "secondSarees" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "actCut" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "shortPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "interestRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "interestDays" INTEGER NOT NULL DEFAULT 0,
  "interestAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "interestPerPc" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "costWithoutInterest" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "costWithDiscount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "basicCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "takaDetails" JSONB,
  "status" TEXT NOT NULL DEFAULT 'posted',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CuttingCard_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CuttingCard_userId_idx" ON "CuttingCard"("userId");
CREATE INDEX IF NOT EXISTS "CuttingCard_cutCardNo_idx" ON "CuttingCard"("cutCardNo");
CREATE INDEX IF NOT EXISTS "CuttingCard_greyDispatchId_idx" ON "CuttingCard"("greyDispatchId");
CREATE INDEX IF NOT EXISTS "CuttingCard_entryDate_idx" ON "CuttingCard"("entryDate");
CREATE INDEX IF NOT EXISTS "CuttingCard_status_idx" ON "CuttingCard"("status");

DO $$ BEGIN
  ALTER TABLE "CuttingCard" ADD CONSTRAINT "CuttingCard_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
