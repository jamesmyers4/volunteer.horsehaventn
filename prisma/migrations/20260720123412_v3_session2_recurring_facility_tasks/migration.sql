-- CreateEnum
CREATE TYPE "FacilityTaskCategory" AS ENUM ('TROUGH_CLEAN', 'STALL_CLEAN', 'STALL_STRIP');

-- AlterTable
ALTER TABLE "Location" ADD COLUMN     "requiresStripClean" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "FacilityTaskType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "FacilityTaskCategory" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacilityTaskType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringTaskTemplate" (
    "id" TEXT NOT NULL,
    "taskTypeId" TEXT NOT NULL,
    "targetLocationId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "shiftType" "ShiftType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringTaskTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FacilityTaskCompletion" (
    "id" TEXT NOT NULL,
    "taskTypeId" TEXT NOT NULL,
    "targetLocationId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "shiftType" "ShiftType" NOT NULL,
    "completedById" TEXT NOT NULL,
    "notes" TEXT,
    "templateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FacilityTaskCompletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FacilityTaskType_name_key" ON "FacilityTaskType"("name");

-- CreateIndex
CREATE UNIQUE INDEX "FacilityTaskType_category_key" ON "FacilityTaskType"("category");

-- CreateIndex
CREATE INDEX "RecurringTaskTemplate_dayOfWeek_shiftType_idx" ON "RecurringTaskTemplate"("dayOfWeek", "shiftType");

-- CreateIndex
CREATE INDEX "RecurringTaskTemplate_taskTypeId_idx" ON "RecurringTaskTemplate"("taskTypeId");

-- CreateIndex
CREATE INDEX "RecurringTaskTemplate_targetLocationId_idx" ON "RecurringTaskTemplate"("targetLocationId");

-- CreateIndex
CREATE INDEX "FacilityTaskCompletion_date_shiftType_idx" ON "FacilityTaskCompletion"("date", "shiftType");

-- CreateIndex
CREATE INDEX "FacilityTaskCompletion_templateId_idx" ON "FacilityTaskCompletion"("templateId");

-- CreateIndex
CREATE INDEX "FacilityTaskCompletion_targetLocationId_idx" ON "FacilityTaskCompletion"("targetLocationId");

-- AddForeignKey
ALTER TABLE "RecurringTaskTemplate" ADD CONSTRAINT "RecurringTaskTemplate_taskTypeId_fkey" FOREIGN KEY ("taskTypeId") REFERENCES "FacilityTaskType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTaskTemplate" ADD CONSTRAINT "RecurringTaskTemplate_targetLocationId_fkey" FOREIGN KEY ("targetLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityTaskCompletion" ADD CONSTRAINT "FacilityTaskCompletion_taskTypeId_fkey" FOREIGN KEY ("taskTypeId") REFERENCES "FacilityTaskType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityTaskCompletion" ADD CONSTRAINT "FacilityTaskCompletion_targetLocationId_fkey" FOREIGN KEY ("targetLocationId") REFERENCES "Location"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityTaskCompletion" ADD CONSTRAINT "FacilityTaskCompletion_completedById_fkey" FOREIGN KEY ("completedById") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FacilityTaskCompletion" ADD CONSTRAINT "FacilityTaskCompletion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "RecurringTaskTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;
