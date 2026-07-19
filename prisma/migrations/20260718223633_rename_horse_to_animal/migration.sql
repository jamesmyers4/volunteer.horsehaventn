-- Generalize the core entity from Horse to Animal (mules, donkeys, minis, ponies, and
-- non-equine animals like the barn cat also need to be tracked). Written by hand as
-- renames rather than relying on `prisma migrate dev`'s auto-diff, which treats an
-- unrecognized rename as drop-then-create and would destroy real production rows.

-- Enums: rename existing, add new species enum
ALTER TYPE "HorseStatus" RENAME TO "AnimalStatus";
ALTER TYPE "HorseSex" RENAME TO "AnimalSex";
CREATE TYPE "AnimalSpecies" AS ENUM ('HORSE', 'DONKEY', 'MULE', 'MINI_HORSE', 'PONY', 'CAT', 'OTHER');

-- Core table: Horse -> Animal
ALTER TABLE "Horse" RENAME TO "Animal";
ALTER TABLE "Animal" RENAME CONSTRAINT "Horse_pkey" TO "Animal_pkey";
ALTER INDEX "Horse_status_idx" RENAME TO "Animal_status_idx";
ALTER INDEX "Horse_legalCase_idx" RENAME TO "Animal_legalCase_idx";

-- New species column; every existing record is a horse by definition until proven otherwise
ALTER TABLE "Animal" ADD COLUMN "species" "AnimalSpecies" NOT NULL DEFAULT 'HORSE';

-- HorsePhoto -> AnimalPhoto
ALTER TABLE "HorsePhoto" RENAME TO "AnimalPhoto";
ALTER TABLE "AnimalPhoto" RENAME COLUMN "horseId" TO "animalId";
ALTER TABLE "AnimalPhoto" RENAME CONSTRAINT "HorsePhoto_pkey" TO "AnimalPhoto_pkey";
ALTER TABLE "AnimalPhoto" RENAME CONSTRAINT "HorsePhoto_horseId_fkey" TO "AnimalPhoto_animalId_fkey";
ALTER INDEX "HorsePhoto_horseId_idx" RENAME TO "AnimalPhoto_animalId_idx";
ALTER INDEX "HorsePhoto_relatedEntityType_relatedEntityId_idx" RENAME TO "AnimalPhoto_relatedEntityType_relatedEntityId_idx";

-- Placement
ALTER TABLE "Placement" RENAME COLUMN "horseId" TO "animalId";
ALTER TABLE "Placement" RENAME CONSTRAINT "Placement_horseId_fkey" TO "Placement_animalId_fkey";
ALTER INDEX "Placement_horseId_idx" RENAME TO "Placement_animalId_idx";

-- FeedingBaseline
ALTER TABLE "FeedingBaseline" RENAME COLUMN "horseId" TO "animalId";
ALTER TABLE "FeedingBaseline" RENAME CONSTRAINT "FeedingBaseline_horseId_fkey" TO "FeedingBaseline_animalId_fkey";
ALTER INDEX "FeedingBaseline_horseId_idx" RENAME TO "FeedingBaseline_animalId_idx";

-- MedicationRegimen
ALTER TABLE "MedicationRegimen" RENAME COLUMN "horseId" TO "animalId";
ALTER TABLE "MedicationRegimen" RENAME CONSTRAINT "MedicationRegimen_horseId_fkey" TO "MedicationRegimen_animalId_fkey";
ALTER INDEX "MedicationRegimen_horseId_idx" RENAME TO "MedicationRegimen_animalId_idx";

-- CareEntry
ALTER TABLE "CareEntry" RENAME COLUMN "horseId" TO "animalId";
ALTER TABLE "CareEntry" RENAME CONSTRAINT "CareEntry_horseId_fkey" TO "CareEntry_animalId_fkey";
ALTER INDEX "CareEntry_horseId_idx" RENAME TO "CareEntry_animalId_idx";

-- HealthIssue
ALTER TABLE "HealthIssue" RENAME COLUMN "horseId" TO "animalId";
ALTER TABLE "HealthIssue" RENAME CONSTRAINT "HealthIssue_horseId_fkey" TO "HealthIssue_animalId_fkey";
ALTER INDEX "HealthIssue_horseId_idx" RENAME TO "HealthIssue_animalId_idx";

-- RecurringCareSchedule
ALTER TABLE "RecurringCareSchedule" RENAME COLUMN "horseId" TO "animalId";
ALTER TABLE "RecurringCareSchedule" RENAME CONSTRAINT "RecurringCareSchedule_horseId_fkey" TO "RecurringCareSchedule_animalId_fkey";
ALTER INDEX "RecurringCareSchedule_horseId_idx" RENAME TO "RecurringCareSchedule_animalId_idx";

-- HorseMetric -> AnimalMetric
ALTER TABLE "HorseMetric" RENAME TO "AnimalMetric";
ALTER TABLE "AnimalMetric" RENAME COLUMN "horseId" TO "animalId";
ALTER TABLE "AnimalMetric" RENAME CONSTRAINT "HorseMetric_pkey" TO "AnimalMetric_pkey";
ALTER TABLE "AnimalMetric" RENAME CONSTRAINT "HorseMetric_horseId_fkey" TO "AnimalMetric_animalId_fkey";
ALTER TABLE "AnimalMetric" RENAME CONSTRAINT "HorseMetric_metricTypeId_fkey" TO "AnimalMetric_metricTypeId_fkey";
ALTER INDEX "HorseMetric_horseId_idx" RENAME TO "AnimalMetric_animalId_idx";
ALTER INDEX "HorseMetric_metricTypeId_idx" RENAME TO "AnimalMetric_metricTypeId_idx";
ALTER INDEX "HorseMetric_date_idx" RENAME TO "AnimalMetric_date_idx";

-- WeightEntry
ALTER TABLE "WeightEntry" RENAME COLUMN "horseId" TO "animalId";
ALTER TABLE "WeightEntry" RENAME CONSTRAINT "WeightEntry_horseId_fkey" TO "WeightEntry_animalId_fkey";
ALTER INDEX "WeightEntry_horseId_idx" RENAME TO "WeightEntry_animalId_idx";

-- PastureAssignment
ALTER TABLE "PastureAssignment" RENAME COLUMN "horseId" TO "animalId";
ALTER TABLE "PastureAssignment" RENAME CONSTRAINT "PastureAssignment_horseId_fkey" TO "PastureAssignment_animalId_fkey";
ALTER INDEX "PastureAssignment_horseId_idx" RENAME TO "PastureAssignment_animalId_idx";

-- DonationInKind
ALTER TABLE "DonationInKind" RENAME COLUMN "linkedHorseId" TO "linkedAnimalId";
ALTER TABLE "DonationInKind" RENAME CONSTRAINT "DonationInKind_linkedHorseId_fkey" TO "DonationInKind_linkedAnimalId_fkey";
ALTER INDEX "DonationInKind_linkedHorseId_idx" RENAME TO "DonationInKind_linkedAnimalId_idx";

-- Backfill: the one real non-horse record already in this rescue's data is Binx, the barn
-- cat, previously entered as a Horse row for lack of anywhere else to put him. Confirmed by
-- name match against the live dataset before writing this migration (see HANDOFF.md).
UPDATE "Animal" SET "species" = 'CAT' WHERE "name" = 'Binx';
