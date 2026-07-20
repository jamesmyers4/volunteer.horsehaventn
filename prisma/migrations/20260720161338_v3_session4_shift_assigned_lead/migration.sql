-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "assignedLeadId" TEXT;

-- CreateIndex
CREATE INDEX "Shift_assignedLeadId_idx" ON "Shift"("assignedLeadId");

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_assignedLeadId_fkey" FOREIGN KEY ("assignedLeadId") REFERENCES "Volunteer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
