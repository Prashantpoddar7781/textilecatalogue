-- AlterTable
ALTER TABLE "MillReceipt" ADD COLUMN "processType" TEXT NOT NULL DEFAULT 'FINISH';

-- CreateIndex
CREATE INDEX "MillReceipt_processType_idx" ON "MillReceipt"("processType");
