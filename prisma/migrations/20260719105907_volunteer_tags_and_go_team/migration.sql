-- CreateTable
CREATE TABLE "VolunteerTag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "minDaysSinceBlueRelease" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VolunteerTag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VolunteerTagAssignment" (
    "id" TEXT NOT NULL,
    "volunteerId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "assignedById" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removedAt" TIMESTAMP(3),
    "removedById" TEXT,

    CONSTRAINT "VolunteerTagAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VolunteerTag_name_key" ON "VolunteerTag"("name");

-- CreateIndex
CREATE INDEX "VolunteerTagAssignment_volunteerId_idx" ON "VolunteerTagAssignment"("volunteerId");

-- CreateIndex
CREATE INDEX "VolunteerTagAssignment_tagId_idx" ON "VolunteerTagAssignment"("tagId");

-- AddForeignKey
ALTER TABLE "VolunteerTagAssignment" ADD CONSTRAINT "VolunteerTagAssignment_volunteerId_fkey" FOREIGN KEY ("volunteerId") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerTagAssignment" ADD CONSTRAINT "VolunteerTagAssignment_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "VolunteerTag"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerTagAssignment" ADD CONSTRAINT "VolunteerTagAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "Volunteer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VolunteerTagAssignment" ADD CONSTRAINT "VolunteerTagAssignment_removedById_fkey" FOREIGN KEY ("removedById") REFERENCES "Volunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
