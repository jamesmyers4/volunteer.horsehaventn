-- CreateEnum
CREATE TYPE "AlertSeverity" AS ENUM ('INFO', 'WARNING', 'URGENT');

-- AlterTable
ALTER TABLE "ChatChannel" ADD COLUMN     "shiftType" "ShiftType";

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN     "expiresAt" TIMESTAMP(3),
ADD COLUMN     "pinned" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "severity" "AlertSeverity";

-- CreateIndex
CREATE INDEX "ChatMessage_pinned_idx" ON "ChatMessage"("pinned");
