-- CreateTable
CREATE TABLE "BankEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entryType" TEXT NOT NULL,
    "entryDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voucherNumber" TEXT,
    "bankName" TEXT,
    "accountName" TEXT,
    "partyType" TEXT,
    "partyName" TEXT NOT NULL,
    "linkedType" TEXT,
    "linkedId" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "paymentMode" TEXT,
    "referenceNumber" TEXT,
    "remarks" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BankEntry_userId_idx" ON "BankEntry"("userId");

-- CreateIndex
CREATE INDEX "BankEntry_entryType_idx" ON "BankEntry"("entryType");

-- CreateIndex
CREATE INDEX "BankEntry_entryDate_idx" ON "BankEntry"("entryDate");

-- CreateIndex
CREATE INDEX "BankEntry_partyName_idx" ON "BankEntry"("partyName");

-- AddForeignKey
ALTER TABLE "BankEntry" ADD CONSTRAINT "BankEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
