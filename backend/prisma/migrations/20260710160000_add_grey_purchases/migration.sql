-- AlterTable
ALTER TABLE "Supplier" ADD COLUMN "panNumber" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "msmeType" TEXT;
ALTER TABLE "Supplier" ADD COLUMN "udyamNumber" TEXT;

-- CreateTable
CREATE TABLE "GreyPurchase" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "supplierId" TEXT,
    "companyName" TEXT,
    "partyName" TEXT NOT NULL,
    "partyGstin" TEXT,
    "partyMsme" TEXT,
    "quality" TEXT,
    "srNo" INTEGER,
    "orderNo" TEXT,
    "hsnCode" TEXT,
    "billNo" TEXT,
    "brokerName" TEXT,
    "billDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checkerName" TEXT,
    "transactionType" TEXT NOT NULL DEFAULT 'GREY PURCHASE',
    "typeBillNumber" INTEGER,
    "recTaka" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recMts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "purRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lineItems" JSONB NOT NULL,
    "grossAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherAddBefore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherLessBefore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "placeOfSupply" TEXT,
    "stateCode" TEXT,
    "gstType" TEXT,
    "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "cgstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTaxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "payableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherAddAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherLessAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "paidDate" TIMESTAMP(3),
    "despatchMts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GreyPurchase_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GreyPurchase_userId_idx" ON "GreyPurchase"("userId");
CREATE INDEX "GreyPurchase_supplierId_idx" ON "GreyPurchase"("supplierId");
CREATE INDEX "GreyPurchase_billDate_idx" ON "GreyPurchase"("billDate");
CREATE INDEX "GreyPurchase_partyName_idx" ON "GreyPurchase"("partyName");
CREATE INDEX "GreyPurchase_transactionType_idx" ON "GreyPurchase"("transactionType");
CREATE INDEX "GreyPurchase_status_idx" ON "GreyPurchase"("status");

-- AddForeignKey
ALTER TABLE "GreyPurchase" ADD CONSTRAINT "GreyPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GreyPurchase" ADD CONSTRAINT "GreyPurchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
