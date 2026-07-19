-- Hand-written (not `prisma migrate dev` auto-diff): the local test DB has 19 existing
-- Volunteer rows (leftover E2E test users, preserved across Playwright runs per
-- tests/e2e/helpers/db.ts), so Volunteer.checkInCode can't be added as a plain required
-- column with a prisma-level default in one step — same category of fix as the
-- Location.fieldCode NOT NULL gap fixed in 20260718231500. Add nullable, backfill, then
-- tighten to NOT NULL + UNIQUE.

-- CreateEnum
CREATE TYPE "FarmSeason" AS ENUM ('STANDARD', 'WINTER');

-- CreateTable
CREATE TABLE "FarmSettings" (
    "id" TEXT NOT NULL,
    "activeSeason" "FarmSeason" NOT NULL DEFAULT 'STANDARD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FarmSettings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ShiftTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shiftType" "ShiftType" NOT NULL,
    "standardStartTime" TEXT NOT NULL,
    "standardEndTime" TEXT NOT NULL,
    "winterStartTime" TEXT,
    "winterEndTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ShiftTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ShiftTemplate_shiftType_key" ON "ShiftTemplate"("shiftType");

-- AlterTable
ALTER TABLE "Shift" ADD COLUMN "actualStartTime" TEXT, ADD COLUMN "actualEndTime" TEXT;

-- AlterTable: checkInCode added nullable first, see header note.
ALTER TABLE "Volunteer" ADD COLUMN "checkInCode" TEXT;

-- Backfill existing rows. gen_random_uuid() has been built into Postgres core (no
-- extension needed) since PG13; this test/CI image is postgres:16-alpine.
UPDATE "Volunteer" SET "checkInCode" = gen_random_uuid()::text WHERE "checkInCode" IS NULL;

ALTER TABLE "Volunteer" ALTER COLUMN "checkInCode" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Volunteer_checkInCode_key" ON "Volunteer"("checkInCode");
