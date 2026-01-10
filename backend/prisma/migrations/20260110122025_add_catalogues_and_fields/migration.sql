-- AlterTable
ALTER TABLE "Design" ADD COLUMN     "catalogueId" TEXT,
ADD COLUMN     "name" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "firmName" TEXT;

-- CreateTable
CREATE TABLE "Catalogue" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Catalogue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Catalogue_userId_idx" ON "Catalogue"("userId");

-- CreateIndex
CREATE INDEX "Catalogue_name_idx" ON "Catalogue"("name");

-- CreateIndex
CREATE INDEX "Design_catalogueId_idx" ON "Design"("catalogueId");

-- AddForeignKey
ALTER TABLE "Catalogue" ADD CONSTRAINT "Catalogue_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Design" ADD CONSTRAINT "Design_catalogueId_fkey" FOREIGN KEY ("catalogueId") REFERENCES "Catalogue"("id") ON DELETE SET NULL ON UPDATE CASCADE;
