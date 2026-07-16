-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'SHIFT_LEAD', 'VOLUNTEER', 'GUEST');

-- CreateEnum
CREATE TYPE "VolunteerStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "HandlingColor" AS ENUM ('GREEN', 'ORANGE', 'YELLOW', 'BLUE', 'RED');

-- CreateEnum
CREATE TYPE "ShiftType" AS ENUM ('AM', 'PM');

-- CreateEnum
CREATE TYPE "CheckMethod" AS ENUM ('QR', 'SMS', 'KIOSK', 'PWA_TAP', 'ADMIN_ENTRY', 'LEGACY_FORM');

-- CreateEnum
CREATE TYPE "HorseStatus" AS ENUM ('ACTIVE', 'ADOPTED', 'RETURNED', 'DECEASED', 'TRANSFERRED');

-- CreateEnum
CREATE TYPE "HorseSex" AS ENUM ('STALLION', 'GELDING', 'MARE', 'COLT', 'FILLY', 'RIDGLING', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "FeedUnit" AS ENUM ('SCOOP', 'FLAKE', 'SQUIRT', 'POUR', 'OTHER');

-- CreateEnum
CREATE TYPE "FeedCategory" AS ENUM ('MAIN_FEED', 'HAY', 'SUPPLEMENT', 'ADDITIVE');

-- CreateEnum
CREATE TYPE "CareCategory" AS ENUM ('MEDICAL', 'SEASONAL', 'GROOMING', 'OTHER');

-- CreateEnum
CREATE TYPE "WeightContext" AS ENUM ('ROUTINE', 'ASSESSMENT');

-- CreateEnum
CREATE TYPE "ChatChannelType" AS ENUM ('BROADCAST', 'ADMIN', 'SHIFT');

-- CreateEnum
CREATE TYPE "ChangeLogAction" AS ENUM ('CREATE', 'UPDATE');

-- CreateTable
CREATE TABLE "Volunteer" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "emergencyContactName" TEXT,
    "emergencyContactPhone" TEXT,
    "role" "Role" NOT NULL DEFAULT 'VOLUNTEER',
    "status" "VolunteerStatus" NOT NULL DEFAULT 'ACTIVE',
    "tier" "HandlingColor" NOT NULL DEFAULT 'GREEN',
    "tierUpdatedAt" TIMESTAMP(3),
    "hireDate" TIMESTAMP(3),
    "accessValidFrom" TIMESTAMP(3),
    "accessValidUntil" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Volunteer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CredentialType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CredentialRecord" (
    "id" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "credentialTypeId" TEXT NOT NULL,
    "completedDate" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "score" INTEGER,
    "fileRef" TEXT,
    "notes" TEXT,
    "notifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CredentialRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RegularShiftAssignment" (
    "id" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "dayOfWeek" INTEGER NOT NULL,
    "shiftType" "ShiftType" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegularShiftAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Shift" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" "ShiftType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Shift_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckIn" (
    "id" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "shiftId" TEXT NOT NULL,
    "workTypeId" TEXT NOT NULL,
    "checkInAt" TIMESTAMP(3) NOT NULL,
    "checkOutAt" TIMESTAMP(3),
    "checkInMethod" "CheckMethod",
    "checkOutMethod" "CheckMethod",
    "loggedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Horse" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "intakeDate" TIMESTAMP(3),
    "status" "HorseStatus" NOT NULL DEFAULT 'ACTIVE',
    "sex" "HorseSex" NOT NULL DEFAULT 'UNKNOWN',
    "spayed" BOOLEAN NOT NULL DEFAULT false,
    "legalCase" BOOLEAN NOT NULL DEFAULT false,
    "caseReference" TEXT,
    "requiredHandlerColor" "HandlingColor" NOT NULL DEFAULT 'GREEN',
    "handlingNotes" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Horse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorsePhoto" (
    "id" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "takenAt" TIMESTAMP(3),
    "uploadedBy" TEXT,
    "relatedEntityType" TEXT,
    "relatedEntityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HorsePhoto_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Placement" (
    "id" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "adopterName" TEXT NOT NULL,
    "adopterContact" TEXT,
    "placedDate" TIMESTAMP(3) NOT NULL,
    "returnedDate" TIMESTAMP(3),
    "followUpCadence" INTEGER,
    "nextFollowUpDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Placement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "defaultUnit" "FeedUnit" NOT NULL,
    "category" "FeedCategory" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedingBaseline" (
    "id" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "feedTypeId" TEXT NOT NULL,
    "shift" "ShiftType" NOT NULL,
    "amount" DECIMAL(4,2) NOT NULL,
    "requiresSoaking" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FeedingBaseline_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeedingOverride" (
    "id" TEXT NOT NULL,
    "feedingBaselineId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(4,2),
    "reason" TEXT,
    "changedBy" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeedingOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationRegimen" (
    "id" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "drugName" TEXT NOT NULL,
    "dose" TEXT NOT NULL,
    "route" TEXT,
    "frequency" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MedicationRegimen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MedicationLog" (
    "id" TEXT NOT NULL,
    "medicationRegimenId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "administered" BOOLEAN NOT NULL,
    "administeredBy" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MedicationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "CareCategory" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareEntry" (
    "id" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "careTypeId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "performedBy" TEXT NOT NULL,
    "relatedHealthIssueId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HealthIssue" (
    "id" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "resolvedDate" TIMESTAMP(3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HealthIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringCareSchedule" (
    "id" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "careTypeId" TEXT NOT NULL,
    "cadenceDays" INTEGER,
    "lastCompletedDate" TIMESTAMP(3),
    "nextDueDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringCareSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetricType" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HorseMetric" (
    "id" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "metricTypeId" TEXT NOT NULL,
    "value" DECIMAL(4,1) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "recordedBy" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HorseMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeightEntry" (
    "id" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "weight" DECIMAL(6,1) NOT NULL,
    "context" "WeightContext" NOT NULL DEFAULT 'ROUTINE',
    "recordedBy" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeightEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Field" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "boundaryPoints" JSONB,
    "turnoutOrder" INTEGER,
    "bringInOrder" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Field_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PastureAssignment" (
    "id" TEXT NOT NULL,
    "horseId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PastureAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DonationInKind" (
    "id" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "donor" TEXT,
    "dateReceived" TIMESTAMP(3) NOT NULL,
    "linkedHorseId" TEXT,
    "linkedProjectId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DonationInKind_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatChannel" (
    "id" TEXT NOT NULL,
    "type" "ChatChannelType" NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChangeLog" (
    "id" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    "changedBy" TEXT NOT NULL,
    "note" TEXT,
    "action" "ChangeLogAction" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangeLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Volunteer_clerkId_key" ON "Volunteer"("clerkId");

-- CreateIndex
CREATE INDEX "Volunteer_clerkId_idx" ON "Volunteer"("clerkId");

-- CreateIndex
CREATE INDEX "Volunteer_role_idx" ON "Volunteer"("role");

-- CreateIndex
CREATE INDEX "Volunteer_status_idx" ON "Volunteer"("status");

-- CreateIndex
CREATE INDEX "CredentialRecord_volunteerId_idx" ON "CredentialRecord"("volunteerId");

-- CreateIndex
CREATE INDEX "CredentialRecord_credentialTypeId_idx" ON "CredentialRecord"("credentialTypeId");

-- CreateIndex
CREATE INDEX "CredentialRecord_expiresAt_idx" ON "CredentialRecord"("expiresAt");

-- CreateIndex
CREATE INDEX "RegularShiftAssignment_volunteerId_idx" ON "RegularShiftAssignment"("volunteerId");

-- CreateIndex
CREATE INDEX "RegularShiftAssignment_dayOfWeek_shiftType_idx" ON "RegularShiftAssignment"("dayOfWeek", "shiftType");

-- CreateIndex
CREATE UNIQUE INDEX "Shift_date_type_key" ON "Shift"("date", "type");

-- CreateIndex
CREATE INDEX "CheckIn_volunteerId_idx" ON "CheckIn"("volunteerId");

-- CreateIndex
CREATE INDEX "CheckIn_shiftId_idx" ON "CheckIn"("shiftId");

-- CreateIndex
CREATE INDEX "CheckIn_workTypeId_idx" ON "CheckIn"("workTypeId");

-- CreateIndex
CREATE INDEX "CheckIn_checkInAt_idx" ON "CheckIn"("checkInAt");

-- CreateIndex
CREATE INDEX "Horse_status_idx" ON "Horse"("status");

-- CreateIndex
CREATE INDEX "Horse_legalCase_idx" ON "Horse"("legalCase");

-- CreateIndex
CREATE INDEX "HorsePhoto_horseId_idx" ON "HorsePhoto"("horseId");

-- CreateIndex
CREATE INDEX "HorsePhoto_relatedEntityType_relatedEntityId_idx" ON "HorsePhoto"("relatedEntityType", "relatedEntityId");

-- CreateIndex
CREATE INDEX "Placement_horseId_idx" ON "Placement"("horseId");

-- CreateIndex
CREATE INDEX "Placement_nextFollowUpDate_idx" ON "Placement"("nextFollowUpDate");

-- CreateIndex
CREATE INDEX "FeedingBaseline_horseId_idx" ON "FeedingBaseline"("horseId");

-- CreateIndex
CREATE INDEX "FeedingBaseline_feedTypeId_idx" ON "FeedingBaseline"("feedTypeId");

-- CreateIndex
CREATE INDEX "FeedingOverride_feedingBaselineId_idx" ON "FeedingOverride"("feedingBaselineId");

-- CreateIndex
CREATE INDEX "FeedingOverride_date_idx" ON "FeedingOverride"("date");

-- CreateIndex
CREATE INDEX "MedicationRegimen_horseId_idx" ON "MedicationRegimen"("horseId");

-- CreateIndex
CREATE INDEX "MedicationLog_medicationRegimenId_idx" ON "MedicationLog"("medicationRegimenId");

-- CreateIndex
CREATE INDEX "MedicationLog_date_idx" ON "MedicationLog"("date");

-- CreateIndex
CREATE INDEX "CareEntry_horseId_idx" ON "CareEntry"("horseId");

-- CreateIndex
CREATE INDEX "CareEntry_careTypeId_idx" ON "CareEntry"("careTypeId");

-- CreateIndex
CREATE INDEX "CareEntry_date_idx" ON "CareEntry"("date");

-- CreateIndex
CREATE INDEX "CareEntry_relatedHealthIssueId_idx" ON "CareEntry"("relatedHealthIssueId");

-- CreateIndex
CREATE INDEX "HealthIssue_horseId_idx" ON "HealthIssue"("horseId");

-- CreateIndex
CREATE INDEX "HealthIssue_active_idx" ON "HealthIssue"("active");

-- CreateIndex
CREATE INDEX "RecurringCareSchedule_horseId_idx" ON "RecurringCareSchedule"("horseId");

-- CreateIndex
CREATE INDEX "RecurringCareSchedule_nextDueDate_idx" ON "RecurringCareSchedule"("nextDueDate");

-- CreateIndex
CREATE INDEX "HorseMetric_horseId_idx" ON "HorseMetric"("horseId");

-- CreateIndex
CREATE INDEX "HorseMetric_metricTypeId_idx" ON "HorseMetric"("metricTypeId");

-- CreateIndex
CREATE INDEX "HorseMetric_date_idx" ON "HorseMetric"("date");

-- CreateIndex
CREATE INDEX "WeightEntry_horseId_idx" ON "WeightEntry"("horseId");

-- CreateIndex
CREATE INDEX "WeightEntry_date_idx" ON "WeightEntry"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Field_code_key" ON "Field"("code");

-- CreateIndex
CREATE INDEX "PastureAssignment_horseId_idx" ON "PastureAssignment"("horseId");

-- CreateIndex
CREATE INDEX "PastureAssignment_fieldId_idx" ON "PastureAssignment"("fieldId");

-- CreateIndex
CREATE INDEX "PastureAssignment_endDate_idx" ON "PastureAssignment"("endDate");

-- CreateIndex
CREATE INDEX "DonationInKind_linkedHorseId_idx" ON "DonationInKind"("linkedHorseId");

-- CreateIndex
CREATE INDEX "ChatMessage_channelId_idx" ON "ChatMessage"("channelId");

-- CreateIndex
CREATE INDEX "ChatMessage_senderId_idx" ON "ChatMessage"("senderId");

-- CreateIndex
CREATE INDEX "ChangeLog_entityType_entityId_idx" ON "ChangeLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "ChangeLog_changedBy_idx" ON "ChangeLog"("changedBy");

-- CreateIndex
CREATE INDEX "ChangeLog_createdAt_idx" ON "ChangeLog"("createdAt");

-- AddForeignKey
ALTER TABLE "CredentialRecord" ADD CONSTRAINT "CredentialRecord_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CredentialRecord" ADD CONSTRAINT "CredentialRecord_credentialTypeId_fkey" FOREIGN KEY ("credentialTypeId") REFERENCES "CredentialType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegularShiftAssignment" ADD CONSTRAINT "RegularShiftAssignment_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_workTypeId_fkey" FOREIGN KEY ("workTypeId") REFERENCES "WorkType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckIn" ADD CONSTRAINT "CheckIn_loggedById_fkey" FOREIGN KEY ("loggedById") REFERENCES "Volunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorsePhoto" ADD CONSTRAINT "HorsePhoto_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Placement" ADD CONSTRAINT "Placement_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingBaseline" ADD CONSTRAINT "FeedingBaseline_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingBaseline" ADD CONSTRAINT "FeedingBaseline_feedTypeId_fkey" FOREIGN KEY ("feedTypeId") REFERENCES "FeedType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeedingOverride" ADD CONSTRAINT "FeedingOverride_feedingBaselineId_fkey" FOREIGN KEY ("feedingBaselineId") REFERENCES "FeedingBaseline"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationRegimen" ADD CONSTRAINT "MedicationRegimen_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MedicationLog" ADD CONSTRAINT "MedicationLog_medicationRegimenId_fkey" FOREIGN KEY ("medicationRegimenId") REFERENCES "MedicationRegimen"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareEntry" ADD CONSTRAINT "CareEntry_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareEntry" ADD CONSTRAINT "CareEntry_careTypeId_fkey" FOREIGN KEY ("careTypeId") REFERENCES "CareType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareEntry" ADD CONSTRAINT "CareEntry_relatedHealthIssueId_fkey" FOREIGN KEY ("relatedHealthIssueId") REFERENCES "HealthIssue"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HealthIssue" ADD CONSTRAINT "HealthIssue_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringCareSchedule" ADD CONSTRAINT "RecurringCareSchedule_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringCareSchedule" ADD CONSTRAINT "RecurringCareSchedule_careTypeId_fkey" FOREIGN KEY ("careTypeId") REFERENCES "CareType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorseMetric" ADD CONSTRAINT "HorseMetric_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HorseMetric" ADD CONSTRAINT "HorseMetric_metricTypeId_fkey" FOREIGN KEY ("metricTypeId") REFERENCES "MetricType"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WeightEntry" ADD CONSTRAINT "WeightEntry_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PastureAssignment" ADD CONSTRAINT "PastureAssignment_horseId_fkey" FOREIGN KEY ("horseId") REFERENCES "Horse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PastureAssignment" ADD CONSTRAINT "PastureAssignment_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "Field"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DonationInKind" ADD CONSTRAINT "DonationInKind_linkedHorseId_fkey" FOREIGN KEY ("linkedHorseId") REFERENCES "Horse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "ChatChannel"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMessage" ADD CONSTRAINT "ChatMessage_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
