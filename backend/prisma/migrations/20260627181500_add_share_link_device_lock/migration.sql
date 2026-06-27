ALTER TABLE "ShareLink"
ADD COLUMN "securityMode" TEXT NOT NULL DEFAULT 'normal',
ADD COLUMN "lockedDeviceToken" TEXT,
ADD COLUMN "lockedAt" TIMESTAMP(3);

CREATE INDEX "ShareLink_securityMode_idx" ON "ShareLink"("securityMode");
