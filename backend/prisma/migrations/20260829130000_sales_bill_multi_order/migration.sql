-- One Finish Sales bill may cover several Sales Orders.
-- Additive only: sourceSalesOrderId keeps pointing at the primary order.
ALTER TABLE "Order"
  ADD COLUMN "sourceSalesOrderIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
