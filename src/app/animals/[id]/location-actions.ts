"use server"

import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// Append-only (V2.md Session 1) — always inserts a new row, never closes/updates an old
// one. "Current location" for this animal+period is whichever row has the latest
// effectiveAt, derived at read time (see src/app/animals/[id]/page.tsx). Not wrapped in
// withChangeLog: AnimalLocationAssignment isn't a tracked model (see prisma/schema.prisma's
// comment on the model) since it already captures who/when directly on the row.
export async function createLocationAssignment(animalId: string, formData: FormData) {
  const volunteer = await requireRole(["ADMIN", "SHIFT_LEAD"])

  const locationId = String(formData.get("locationId"))
  const period = String(formData.get("period")) as "DAY" | "NIGHT"
  const notesRaw = formData.get("notes")
  const notes = notesRaw ? String(notesRaw) : undefined

  await prisma.animalLocationAssignment.create({
    data: { animalId, locationId, period, effectiveAt: new Date(), recordedById: volunteer.id, notes }
  })

  redirect(`/animals/${animalId}`)
}
