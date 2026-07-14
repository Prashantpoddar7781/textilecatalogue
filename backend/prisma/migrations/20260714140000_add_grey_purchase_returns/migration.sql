-- CreateTable
CREATE TABLE "GreyPurchaseReturn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "greyPurchaseId" TEXT NOT NULL,
    "greyDispatchId" TEXT,
    "companyName" TEXT,
    "entryType" TEXT NOT NULL DEFAULT 'GREY PURCHASE',
    "greyType" TEXT NOT NULL DEFAULT 'GREY',
    "voucherNo" INTEGER,
    "saleAccount" TEXT NOT NULL DEFAULT 'GREY PURCHASE RETURN',
    "purSr" INTEGER,
    "quality" TEXT,
    "hsnCode" TEXT,
    "partyName" TEXT NOT NULL,
    "partyGstin" TEXT,
    "placeOfSupply" TEXT,
    "stateCode" TEXT,
    "gstType" TEXT,
    "billNo" TEXT,
    "returnDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "refBillNo" TEXT,
    "refBillDate" TIMESTAMP(3),
    "brokerName" TEXT,
    "challanNo" TEXT,
    "station" TEXT,
    "transport" TEXT,
    "vehicleNo" TEXT,
    "ewayBillNo" TEXT,
    "lrNo" TEXT,
    "checkerName" TEXT,
    "pcs" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "mts" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
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
    "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "adjustBillNo" TEXT,
    "remarks" TEXT,
    "takaDetails" JSONB,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GreyPurchaseReturn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "GreyPurchaseReturn_greyDispatchId_key" ON "GreyPurchaseReturn"("greyDispatchId");

-- CreateIndex
CREATE INDEX "GreyPurchaseReturn_userId_idx" ON "GreyPurchaseReturn"("userId");

-- CreateIndex
CREATE INDEX "GreyPurchaseReturn_greyPurchaseId_idx" ON "GreyPurchaseReturn"("greyPurchaseId");

-- CreateIndex
CREATE INDEX "GreyPurchaseReturn_returnDate_idx" ON "GreyPurchaseReturn"("returnDate");

-- CreateIndex
CREATE INDEX "GreyPurchaseReturn_purSr_idx" ON "GreyPurchaseReturn"("purSr");

-- CreateIndex
CREATE INDEX "GreyPurchaseReturn_partyName_idx" ON "GreyPurchaseReturn"("partyName");

-- CreateIndex
CREATE INDEX "GreyPurchaseReturn_status_idx" ON "GreyPurchaseReturn"("status");

-- AddForeignKey
ALTER TABLE "GreyPurchaseReturn" ADD CONSTRAINT "GreyPurchaseReturn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GreyPurchaseReturn" ADD CONSTRAINT "GreyPurchaseReturn_greyPurchaseId_fkey" FOREIGN KEY ("greyPurchaseId") REFERENCES "GreyPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
