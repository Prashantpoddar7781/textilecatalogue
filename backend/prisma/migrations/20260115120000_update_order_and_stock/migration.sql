-- Make Order.shareLinkId optional
DO $$ 
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'Order' AND column_name = 'shareLinkId' AND is_nullable = 'NO'
    ) THEN
        ALTER TABLE "Order" ALTER COLUMN "shareLinkId" DROP NOT NULL;
    END IF;
END $$;

-- Set default stockQuantity for existing designs
UPDATE "Design" SET "stockQuantity" = 1000 WHERE "stockQuantity" IS NULL;
