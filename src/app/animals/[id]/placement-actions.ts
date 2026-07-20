"use server"

import { randomUUID } from "node:crypto"
import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma, withChangeLog } from "@/lib/prisma"

// V3.md Session 1: the single entry point for marking an animal ADOPTED — updateAnimal
// (src/app/animals/actions.ts) deliberately rejects a direct transition into ADOPTED so
// adopter info always exists alongside the status flip. Admin-only, matching the rest of
// Animal's core-status write access. Two or more animals placed together (bonded animals
// kept together, per CONTEXT.md's source-data notes) share one generated
// `placementGroupId` rather than a dedicated group table — deliberately simple, per V3.md's
// own instruction not to add a PlacementGroup model. No $transaction: this codebase has no
// existing precedent for one, and a partial write here (e.g. the process dying mid-loop)
// just leaves some animals correctly placed and others not-yet-placed, which is a normal
// "keep going" state — nothing here needs all-or-nothing atomicity.
export async function createPlacement(primaryAnimalId: string, formData: FormData) {
  const actor = await requireRole(["ADMIN"])

  const adopterName = String(formData.get("adopterName"))
  const adopterContactRaw = formData.get("adopterContact")
  const placedDate = new Date(String(formData.get("placedDate")))
  const notesRaw = formData.get("notes")
  const coAdoptedAnimalIds = formData.getAll("coAdoptedAnimalIds").map(String).filter(Boolean)

  const animalIds = Array.from(new Set([primaryAnimalId, ...coAdoptedAnimalIds]))
  const placementGroupId = animalIds.length > 1 ? randomUUID() : undefined

  for (const animalId of animalIds) {
    const changeLog = withChangeLog(prisma, actor.id, "Placement recorded")
    await changeLog.placement.create({
      data: {
        animalId,
        adopterName,
        adopterContact: adopterContactRaw ? String(adopterContactRaw) : undefined,
        placedDate,
        notes: notesRaw ? String(notesRaw) : undefined,
        placementGroupId
      }
    })
    await changeLog.animal.update({ where: { id: animalId }, data: { status: "ADOPTED" } })
  }

  redirect(`/animals/${primaryAnimalId}`)
}
