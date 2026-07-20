"use server"

import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// FacilityTaskType.category is @unique against the fixed three-value FacilityTaskCategory enum
// (see that enum's own schema comment) — the same capped-table shape as ShiftTemplate.shiftType
// (src/app/settings/actions.ts's updateShiftTemplate) and TierThreshold.tier. Edit-only (name,
// active), no create/delete UI: a create form could never succeed in practice once all three
// categories are seeded, which prisma/seed.ts already does for every environment. This is a
// deliberate, narrower reading than this model's own schema comment's looser "full CRUD"
// wording — flagging the deviation per this project's own convention, matching the reasoning
// already given right on FacilityTaskCategory's enum comment.
export async function updateFacilityTaskType(taskTypeId: string, formData: FormData) {
  await requireRole(["ADMIN"])

  const name = String(formData.get("name"))
  const active = formData.get("active") === "on"

  await prisma.facilityTaskType.update({ where: { id: taskTypeId }, data: { name, active } })

  redirect("/admin/facility-task-types")
}
