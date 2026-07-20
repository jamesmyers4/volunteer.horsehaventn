"use server"

import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma, withChangeLog } from "@/lib/prisma"

// V3.md Session 1: "IntakeGroup assignment... restricted to ADMIN/SHIFT_LEAD, matching the
// Location-assignment permission pattern" — kept as its own small action, separate from the
// Admin-only updateAnimal core-fields path, even though intakeGroupId lives directly on
// Animal. Animal is a tracked model, so this still routes through withChangeLog like any
// other Animal write.
export async function assignIntakeGroup(animalId: string, formData: FormData) {
  const actor = await requireRole(["ADMIN", "SHIFT_LEAD"])

  const intakeGroupIdRaw = formData.get("intakeGroupId")

  await withChangeLog(prisma, actor.id, "Intake group assigned").animal.update({
    where: { id: animalId },
    data: { intakeGroupId: intakeGroupIdRaw ? String(intakeGroupIdRaw) : null }
  })

  redirect(`/animals/${animalId}`)
}
