"use server"

import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma, withChangeLog } from "@/lib/prisma"

type RelationTypeInput = "SIRE_OF" | "DAM_OF" | "SIBLING_OF" | "OTHER"

// V3.md Session 1: create-only. One row per real relationship — the inverse direction is
// derived at read time (src/lib/relationships.ts), never stored as a second row, so editing
// isn't needed to keep both "sides" in sync. ChangeLog-tracked (confirmed with James): a
// lineage claim on a legalCase animal sits on the same legal-defensibility surface as Animal
// itself (CONTEXT.md §4/§11).
export async function createAnimalRelationship(animalId: string, formData: FormData) {
  const actor = await requireRole(["ADMIN", "SHIFT_LEAD"])

  const relatedAnimalId = String(formData.get("relatedAnimalId"))
  const relationType = String(formData.get("relationType")) as RelationTypeInput
  const notesRaw = formData.get("notes")

  if (relatedAnimalId === animalId) throw new Error("An animal cannot be related to itself")

  await withChangeLog(prisma, actor.id, "Relationship recorded").animalRelationship.create({
    data: {
      animalId,
      relatedAnimalId,
      relationType,
      notes: notesRaw ? String(notesRaw) : undefined,
      recordedById: actor.id
    }
  })

  redirect(`/animals/${animalId}`)
}
