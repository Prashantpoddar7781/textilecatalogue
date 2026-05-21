-- Switch OTP authentication from SMS/mobile numbers to email delivery.
DROP TABLE IF EXISTS "OtpCode";
DROP INDEX IF EXISTS "User_mobileNumber_key";
ALTER TABLE "User" DROP COLUMN IF EXISTS "mobileNumber";

CREATE TABLE "OtpCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "email" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtpCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OtpCode_email_idx" ON "OtpCode"("email");
CREATE INDEX "OtpCode_purpose_idx" ON "OtpCode"("purpose");
CREATE INDEX "OtpCode_expiresAt_idx" ON "OtpCode"("expiresAt");

ALTER TABLE "OtpCode" ADD CONSTRAINT "OtpCode_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
