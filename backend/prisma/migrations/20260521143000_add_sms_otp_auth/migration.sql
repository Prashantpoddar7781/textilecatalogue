-- Add optional phone number based authentication support.
ALTER TABLE "User" ADD COLUMN "mobileNumber" TEXT;

CREATE UNIQUE INDEX "User_mobileNumber_key" ON "User"("mobileNumber");

CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "mobileNumber" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OtpCode_mobileNumber_idx" ON "OtpCode"("mobileNumber");
CREATE INDEX "OtpCode_purpose_idx" ON "OtpCode"("purpose");
CREATE INDEX "OtpCode_expiresAt_idx" ON "OtpCode"("expiresAt");

ALTER TABLE "OtpCode" ADD CONSTRAINT "OtpCode_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
