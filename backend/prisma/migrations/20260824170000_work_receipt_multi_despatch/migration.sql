-- One work receipt bill may cover several work despatch challans.
-- Additive only: workDespatchId keeps pointing at the primary despatch, so existing
-- receipts, relations and reports are unaffected. Legacy rows get an empty array and
-- fall back to workDespatchId when pending is calculated.
ALTER TABLE "WorkReceipt"
  ADD COLUMN "sourceDespatchIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
