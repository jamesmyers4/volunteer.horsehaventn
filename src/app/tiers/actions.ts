"use server"

import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// TierThreshold is admin-editable data, not hardcoded constants (V2.md Session 2) — same
// lookup-table-config category as Location/FeedType, not ChangeLog-tracked. Rows are seeded
// once per tier (prisma/seed.ts) and only ever edited, never created/deleted here, since the
// four tiers are a fixed enum, not a growable set.
export async function updateTierThreshold(tierThresholdId: string, formData: FormData) {
  await requireRole(["ADMIN"])

  const minDaysTenure = Number(formData.get("minDaysTenure"))
  const requiresManualRelease = formData.get("requiresManualRelease") === "on"

  await prisma.tierThreshold.update({
    where: { id: tierThresholdId },
    data: { minDaysTenure, requiresManualRelease }
  })

  redirect("/tiers")
}
