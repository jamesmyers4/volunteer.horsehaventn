-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('SIRE_OF', 'DAM_OF', 'SIBLING_OF', 'OTHER');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AnimalStatus" ADD VALUE 'FOSTER';
ALTER TYPE "AnimalStatus" ADD VALUE 'PENDING_ADOPTION';

-- AlterTable
ALTER TABLE "Animal" ADD COLUMN     "intakeGroupId" TEXT;

-- AlterTable
ALTER TABLE "Placement" ADD COLUMN     "placementGroupId" TEXT;

-- CreateTable
CREATE TABLE "IntakeGroup" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "intakeDate" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IntakeGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalRelationship" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "relatedAnimalId" TEXT NOT NULL,
    "relationType" "RelationType" NOT NULL,
    "notes" TEXT,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimalRelationship_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnimalRelationship_animalId_idx" ON "AnimalRelationship"("animalId");

-- CreateIndex
CREATE INDEX "AnimalRelationship_relatedAnimalId_idx" ON "AnimalRelationship"("relatedAnimalId");

-- CreateIndex
CREATE INDEX "Animal_intakeGroupId_idx" ON "Animal"("intakeGroupId");

-- CreateIndex
CREATE INDEX "Placement_placementGroupId_idx" ON "Placement"("placementGroupId");

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_intakeGroupId_fkey" FOREIGN KEY ("intakeGroupId") REFERENCES "IntakeGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalRelationship" ADD CONSTRAINT "AnimalRelationship_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalRelationship" ADD CONSTRAINT "AnimalRelationship_relatedAnimalId_fkey" FOREIGN KEY ("relatedAnimalId") REFERENCES "Animal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalRelationship" ADD CONSTRAINT "AnimalRelationship_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
