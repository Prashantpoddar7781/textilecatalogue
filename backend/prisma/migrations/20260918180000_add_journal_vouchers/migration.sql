-- CreateTable
CREATE TABLE "JournalVoucher" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionType" TEXT NOT NULL DEFAULT 'JOURNAL',
    "typeBillNumber" INTEGER,
    "voucherNumber" TEXT,
    "voucherDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "companyName" TEXT,
    "partyType" TEXT NOT NULL,
    "partyName" TEXT NOT NULL,
    "customerId" TEXT,
    "supplierId" TEXT,
    "oppositeAccount" TEXT NOT NULL,
    "partySide" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "narration" TEXT,
    "remarks" TEXT,
    "status" TEXT NOT NULL DEFAULT 'posted',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JournalVoucher_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JournalVoucher_userId_idx" ON "JournalVoucher"("userId");

-- CreateIndex
CREATE INDEX "JournalVoucher_partyName_idx" ON "JournalVoucher"("partyName");

-- CreateIndex
CREATE INDEX "JournalVoucher_voucherDate_idx" ON "JournalVoucher"("voucherDate");

-- CreateIndex
CREATE INDEX "JournalVoucher_transactionType_idx" ON "JournalVoucher"("transactionType");

-- CreateIndex
CREATE INDEX "JournalVoucher_status_idx" ON "JournalVoucher"("status");

-- CreateIndex
CREATE INDEX "JournalVoucher_oppositeAccount_idx" ON "JournalVoucher"("oppositeAccount");

-- AddForeignKey
ALTER TABLE "JournalVoucher" ADD CONSTRAINT "JournalVoucher_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
