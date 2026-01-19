-- Create OrderDraft table
CREATE TABLE IF NOT EXISTS "OrderDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceText" TEXT NOT NULL,
    "draftJson" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderDraft_pkey" PRIMARY KEY ("id")
);

-- Create indexes
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'OrderDraft_userId_idx') THEN
        CREATE INDEX "OrderDraft_userId_idx" ON "OrderDraft"("userId");
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'OrderDraft_createdAt_idx') THEN
        CREATE INDEX "OrderDraft_createdAt_idx" ON "OrderDraft"("createdAt");
    END IF;
END $$;

-- Add foreign key
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'OrderDraft_userId_fkey') THEN
        ALTER TABLE "OrderDraft" ADD CONSTRAINT "OrderDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
