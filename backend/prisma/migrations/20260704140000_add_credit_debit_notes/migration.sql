-- CreateTable
CREATE TABLE "CreditDebitNote" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "noteKind" TEXT NOT NULL,
    "noteSide" TEXT NOT NULL,
    "companyName" TEXT,
    "voucherNumber" INTEGER,
    "noteNumber" TEXT,
    "noteDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "partyType" TEXT NOT NULL,
    "partyName" TEXT NOT NULL,
    "customerId" TEXT,
    "supplierId" TEXT,
    "placeOfSupply" TEXT,
    "gstType" TEXT,
    "refBillNumber" TEXT,
    "refBillDate" TIMESTAMP(3),
    "challanNumber" TEXT,
    "saleAccount" TEXT,
    "purchaseType" TEXT,
    "pieces" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "grossAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "otherLess" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "addAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "returnGoods" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hsnSac" TEXT,
    "taxableAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "gstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cgstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igstRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalTaxAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tcsRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tcsAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmountAfterTds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "adjustBillNumber" TEXT,
    "adjustBillId" TEXT,
    "remarks" TEXT,
    "isTally" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditDebitNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditDebitNote_userId_idx" ON "CreditDebitNote"("userId");
CREATE INDEX "CreditDebitNote_noteKind_noteSide_idx" ON "CreditDebitNote"("noteKind", "noteSide");
CREATE INDEX "CreditDebitNote_partyName_idx" ON "CreditDebitNote"("partyName");
CREATE INDEX "CreditDebitNote_noteDate_idx" ON "CreditDebitNote"("noteDate");
CREATE INDEX "CreditDebitNote_status_idx" ON "CreditDebitNote"("status");

-- AddForeignKey
ALTER TABLE "CreditDebitNote" ADD CONSTRAINT "CreditDebitNote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
