-- Add subscription/trial fields for users
ALTER TABLE "User"
ADD COLUMN "trialEndsAt" TIMESTAMP(3),
ADD COLUMN "subscriptionStatus" TEXT,
ADD COLUMN "subscriptionPlan" TEXT,
ADD COLUMN "subscriptionStartedAt" TIMESTAMP(3),
ADD COLUMN "subscriptionEndsAt" TIMESTAMP(3),
ADD COLUMN "razorpayCustomerId" TEXT,
ADD COLUMN "razorpaySubscriptionId" TEXT,
ADD COLUMN "freeOverride" BOOLEAN NOT NULL DEFAULT false;
