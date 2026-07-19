-- AlterTable
ALTER TABLE "CredentialType" ADD COLUMN     "appliesToTier" "HandlingColor",
ADD COLUMN     "fileUrl" TEXT,
ADD COLUMN     "isRequired" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "renewalPeriodDays" INTEGER;

-- AlterTable
ALTER TABLE "Volunteer" ADD COLUMN     "blueReleasedAt" TIMESTAMP(3),
ADD COLUMN     "blueReleasedById" TEXT,
ADD COLUMN     "firstShiftDate" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TierThreshold" (
    "id" TEXT NOT NULL,
    "tier" "HandlingColor" NOT NULL,
    "minDaysTenure" INTEGER NOT NULL,
    "requiresManualRelease" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TierThreshold_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TierThreshold_tier_key" ON "TierThreshold"("tier");

-- CreateIndex
CREATE INDEX "TierThreshold_tier_idx" ON "TierThreshold"("tier");

-- AddForeignKey
ALTER TABLE "Volunteer" ADD CONSTRAINT "Volunteer_blueReleasedById_fkey" FOREIGN KEY ("blueReleasedById") REFERENCES "Volunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
