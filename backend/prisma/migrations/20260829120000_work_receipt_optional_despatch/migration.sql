-- Direct work rec bills may be saved without a linked work desp challan.
ALTER TABLE "WorkReceipt" ALTER COLUMN "workDespatchId" DROP NOT NULL;
