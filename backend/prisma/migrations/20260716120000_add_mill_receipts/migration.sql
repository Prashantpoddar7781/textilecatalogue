-- CreateTable
CREATE TABLE "MillReceipt" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "greyDispatchId" TEXT NOT NULL,
    "greyPurchaseId" TEXT,
    "companyName" TEXT,
    "millName" TEXT NOT NULL,
    "millGstin" TEXT,
    "partyMsme" TEXT,
    "entryType" TEXT NOT NULL DEFAULT 'JOB WORK',
    "hsnCode" TEXT DEFAULT '9988',
    "voucherNo" INTEGER,
    "receiptDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "billNo" TEXT,
    "placeOfSupply" TEXT,
    "stateCode" TEXT,
    "gstType" TEXT,
    "lotNo" TEXT NOT NULL,
    "despNo" TEXT,
    "recChallan" TEXT,
    "marka" TEXT,
    "quality" TEXT,
    "printStyle" TEXT,
    "recTaka" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "recMts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "greyMts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shortMts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "shortPct" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "jobRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "jobAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rdPerMtr" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rdLessAddAmt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherLess" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherAdd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taxableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 5,
    "cgstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "invoiceValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tdsOnAmt" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tdsPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tdsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAfterTds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remarks" TEXT,
    "takaDetails" JSONB,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MillReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MillReceipt_userId_idx" ON "MillReceipt"("userId");

-- CreateIndex
CREATE INDEX "MillReceipt_greyDispatchId_idx" ON "MillReceipt"("greyDispatchId");

-- CreateIndex
CREATE INDEX "MillReceipt_greyPurchaseId_idx" ON "MillReceipt"("greyPurchaseId");

-- CreateIndex
CREATE INDEX "MillReceipt_receiptDate_idx" ON "MillReceipt"("receiptDate");

-- CreateIndex
CREATE INDEX "MillReceipt_millName_idx" ON "MillReceipt"("millName");

-- CreateIndex
CREATE INDEX "MillReceipt_lotNo_idx" ON "MillReceipt"("lotNo");

-- CreateIndex
CREATE INDEX "MillReceipt_voucherNo_idx" ON "MillReceipt"("voucherNo");

-- CreateIndex
CREATE INDEX "MillReceipt_status_idx" ON "MillReceipt"("status");

-- AddForeignKey
ALTER TABLE "MillReceipt" ADD CONSTRAINT "MillReceipt_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MillReceipt" ADD CONSTRAINT "MillReceipt_greyDispatchId_fkey" FOREIGN KEY ("greyDispatchId") REFERENCES "GreyDispatch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MillReceipt" ADD CONSTRAINT "MillReceipt_greyPurchaseId_fkey" FOREIGN KEY ("greyPurchaseId") REFERENCES "GreyPurchase"("id") ON DELETE SET NULL ON UPDATE CASCADE;
