-- Safely drop Group tables if they exist
DO $$ 
BEGIN
    -- Drop foreign keys if they exist
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Group_userId_fkey') THEN
        ALTER TABLE "Group" DROP CONSTRAINT "Group_userId_fkey";
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'GroupMember_groupId_fkey') THEN
        ALTER TABLE "GroupMember" DROP CONSTRAINT "GroupMember_groupId_fkey";
    END IF;
    
    -- Drop tables if they exist
    DROP TABLE IF EXISTS "GroupMember";
    DROP TABLE IF EXISTS "Group";
END $$;

-- AlterTable: Add new columns to Design (using IF NOT EXISTS equivalent)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Design' AND column_name = 'additionalPrices') THEN
        ALTER TABLE "Design" ADD COLUMN "additionalPrices" JSONB;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'Design' AND column_name = 'basePrice') THEN
        ALTER TABLE "Design" ADD COLUMN "basePrice" DOUBLE PRECISION;
    END IF;
END $$;

ALTER TABLE "Design" 
    ALTER COLUMN "wholesalePrice" SET DEFAULT 0,
    ALTER COLUMN "retailPrice" SET DEFAULT 0;

-- CreateTable: Contact (only if it doesn't exist)
CREATE TABLE IF NOT EXISTS "Contact" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phoneNumber" TEXT NOT NULL,
    "isSaved" BOOLEAN NOT NULL DEFAULT false,
    "lastShared" TIMESTAMP(3),
    "deliveryStatus" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable: ShareLink (only if it doesn't exist)
CREATE TABLE IF NOT EXISTS "ShareLink" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "designId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "selectedPriceType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: Contact (only if index doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Contact_userId_idx') THEN
        CREATE INDEX "Contact_userId_idx" ON "Contact"("userId");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'Contact_userId_phoneNumber_key') THEN
        CREATE UNIQUE INDEX "Contact_userId_phoneNumber_key" ON "Contact"("userId", "phoneNumber");
    END IF;
END $$;

-- CreateIndex: ShareLink (only if indexes don't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ShareLink_token_key') THEN
        CREATE UNIQUE INDEX "ShareLink_token_key" ON "ShareLink"("token");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ShareLink_userId_idx') THEN
        CREATE INDEX "ShareLink_userId_idx" ON "ShareLink"("userId");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ShareLink_designId_idx') THEN
        CREATE INDEX "ShareLink_designId_idx" ON "ShareLink"("designId");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ShareLink_token_idx') THEN
        CREATE INDEX "ShareLink_token_idx" ON "ShareLink"("token");
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'ShareLink_isActive_idx') THEN
        CREATE INDEX "ShareLink_isActive_idx" ON "ShareLink"("isActive");
    END IF;
END $$;

-- AddForeignKey: Contact (only if constraint doesn't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'Contact_userId_fkey') THEN
        ALTER TABLE "Contact" ADD CONSTRAINT "Contact_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey: ShareLink (only if constraints don't exist)
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ShareLink_userId_fkey') THEN
        ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ShareLink_designId_fkey') THEN
        ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_designId_fkey" FOREIGN KEY ("designId") REFERENCES "Design"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
