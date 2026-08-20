-- Expenses: PUR A/C (purchase / expense ledger account)
ALTER TABLE "PurchaseBill" ADD COLUMN IF NOT EXISTS "purchaseAccount" TEXT;
CREATE INDEX IF NOT EXISTS "PurchaseBill_purchaseAccount_idx" ON "PurchaseBill"("purchaseAccount");
