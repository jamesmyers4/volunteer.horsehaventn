-- Generalize the field-code-only turnout assignment into a Location model that also
-- covers barn stalls, sick bay, and the covered arena as they come online, plus a full
-- append-only move history per animal (V2.md Session 1). Written by hand as renames, same
-- reasoning as the Horse->Animal migration: `prisma migrate dev`'s auto-diff can't tell a
-- rename from a drop-and-recreate without an interactive prompt, and this touches real
-- production Field/PastureAssignment data.

CREATE TYPE "LocationType" AS ENUM ('FIELD', 'BARN_STALL', 'SICK_BAY', 'ARENA', 'OTHER');
CREATE TYPE "LocationPeriod" AS ENUM ('DAY', 'NIGHT');

-- Field -> Location
ALTER TABLE "Field" RENAME TO "Location";
ALTER TABLE "Location" RENAME CONSTRAINT "Field_pkey" TO "Location_pkey";
ALTER TABLE "Location" RENAME COLUMN "code" TO "fieldCode";
ALTER TABLE "Location" RENAME COLUMN "active" TO "isActive";
ALTER INDEX "Field_code_key" RENAME TO "Location_fieldCode_key";

-- `description` was never actually populated (no admin UI ever wrote to it; confirmed all
-- NULL in both seed and live data) - dropped in favor of the new required `name`, which
-- backfills from fieldCode for every existing row.
ALTER TABLE "Location" DROP COLUMN "description";
ALTER TABLE "Location" ADD COLUMN "type" "LocationType" NOT NULL DEFAULT 'FIELD';
ALTER TABLE "Location" ADD COLUMN "name" TEXT;
ALTER TABLE "Location" ADD COLUMN "barnNumber" INTEGER;
ALTER TABLE "Location" ADD COLUMN "stallNumber" INTEGER;
UPDATE "Location" SET "name" = "fieldCode" WHERE "name" IS NULL;
ALTER TABLE "Location" ALTER COLUMN "name" SET NOT NULL;
CREATE INDEX "Location_type_idx" ON "Location"("type");

-- PastureAssignment -> AnimalLocationAssignment
ALTER TABLE "PastureAssignment" RENAME TO "AnimalLocationAssignment";
ALTER TABLE "AnimalLocationAssignment" RENAME CONSTRAINT "PastureAssignment_pkey" TO "AnimalLocationAssignment_pkey";
ALTER TABLE "AnimalLocationAssignment" RENAME COLUMN "fieldId" TO "locationId";
ALTER TABLE "AnimalLocationAssignment" RENAME COLUMN "startDate" TO "effectiveAt";
ALTER TABLE "AnimalLocationAssignment" RENAME CONSTRAINT "PastureAssignment_animalId_fkey" TO "AnimalLocationAssignment_animalId_fkey";
ALTER TABLE "AnimalLocationAssignment" RENAME CONSTRAINT "PastureAssignment_fieldId_fkey" TO "AnimalLocationAssignment_locationId_fkey";

-- `endDate` is dropped, not migrated - the append-only model derives "current" as the
-- latest `effectiveAt` row per animal+period instead of a stored open/closed flag (Postgres
-- automatically drops PastureAssignment_endDate_idx along with the column it indexed).
ALTER TABLE "AnimalLocationAssignment" DROP COLUMN "endDate";
ALTER TABLE "AnimalLocationAssignment" ADD COLUMN "period" "LocationPeriod" NOT NULL DEFAULT 'DAY';
ALTER TABLE "AnimalLocationAssignment" ADD COLUMN "recordedById" TEXT;
ALTER TABLE "AnimalLocationAssignment" ADD COLUMN "notes" TEXT;

-- Backfill recordedById: PastureAssignment was a ChangeLog-tracked model, so every existing
-- row's CREATE is already logged there with a real `changedBy`. Pull it back onto the row
-- itself, since the new model captures who/when directly (see prisma/schema.prisma's
-- comment on AnimalLocationAssignment) instead of relying on ChangeLog for it. Falls back to
-- the earliest-created ADMIN volunteer for the rare row with no matching ChangeLog entry,
-- since recordedById is NOT NULL going forward.
UPDATE "AnimalLocationAssignment" AS ala
SET "recordedById" = sub."changedBy"
FROM (
  SELECT DISTINCT ON ("entityId") "entityId", "changedBy"
  FROM "ChangeLog"
  WHERE "entityType" = 'PastureAssignment' AND "action" = 'CREATE'
  ORDER BY "entityId", "createdAt" ASC
) AS sub
WHERE ala."id" = sub."entityId";

UPDATE "AnimalLocationAssignment"
SET "recordedById" = (SELECT "id" FROM "Volunteer" WHERE "role" = 'ADMIN' ORDER BY "createdAt" ASC LIMIT 1)
WHERE "recordedById" IS NULL;

ALTER TABLE "AnimalLocationAssignment" ALTER COLUMN "recordedById" SET NOT NULL;
ALTER TABLE "AnimalLocationAssignment" ADD CONSTRAINT "AnimalLocationAssignment_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

DROP INDEX "PastureAssignment_animalId_idx";
CREATE INDEX "AnimalLocationAssignment_animalId_period_effectiveAt_idx" ON "AnimalLocationAssignment"("animalId", "period", "effectiveAt");
ALTER INDEX "PastureAssignment_fieldId_idx" RENAME TO "AnimalLocationAssignment_locationId_idx";
