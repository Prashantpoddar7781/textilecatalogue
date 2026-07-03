-- AlterTable
ALTER TABLE "Order" ADD COLUMN "transactionType" TEXT;
ALTER TABLE "Order" ADD COLUMN "typeBillNumber" INTEGER;

-- AlterTable
ALTER TABLE "PurchaseBill" ADD COLUMN "transactionType" TEXT;
ALTER TABLE "PurchaseBill" ADD COLUMN "typeBillNumber" INTEGER;

-- AlterTable
ALTER TABLE "BankEntry" ADD COLUMN "transactionType" TEXT;

-- CreateIndex
CREATE INDEX "Order_userId_transactionType_idx" ON "Order"("userId", "transactionType");
CREATE INDEX "PurchaseBill_userId_transactionType_idx" ON "PurchaseBill"("userId", "transactionType");
CREATE INDEX "BankEntry_transactionType_idx" ON "BankEntry"("transactionType");

-- Backfill defaults
UPDATE "Order" SET "transactionType" = 'FINISH SALES' WHERE "transactionType" IS NULL;
UPDATE "PurchaseBill" SET "transactionType" = 'FINISH PURCHASE' WHERE "transactionType" IS NULL;
