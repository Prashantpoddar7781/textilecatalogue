-- CreateTable
CREATE TABLE "ErpUser" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "accessLevel" TEXT NOT NULL DEFAULT 'data_entry',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ErpUser_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ErpUser_ownerUserId_idx" ON "ErpUser"("ownerUserId");

-- CreateIndex
CREATE INDEX "ErpUser_name_idx" ON "ErpUser"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ErpUser_ownerUserId_name_key" ON "ErpUser"("ownerUserId", "name");

-- AddForeignKey
ALTER TABLE "ErpUser" ADD CONSTRAINT "ErpUser_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
