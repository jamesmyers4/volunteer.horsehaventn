import { prisma } from "./prisma"

// V3.md Session 1: exactly one row per real-world relationship is stored
// (AnimalRelationship.animalId SIRE_OF/DAM_OF/SIBLING_OF/OTHER .relatedAnimalId) — the
// inverse direction is derived here at read time, never a second stored row, so there's
// only ever one row to correct if a lineage claim turns out wrong.
const LABELS: Record<string, { forward: string; inverse: string }> = {
  SIRE_OF: { forward: "Sire of", inverse: "Sire" },
  DAM_OF: { forward: "Dam of", inverse: "Dam" },
  SIBLING_OF: { forward: "Sibling of", inverse: "Sibling of" },
  OTHER: { forward: "Related to", inverse: "Related to" }
}

export type AnimalRelationshipDisplay = {
  id: string
  label: string
  otherAnimalId: string
  otherAnimalName: string
  notes: string | null
}

// Queries both directions (this animal as the recorded `animalId`, and as the
// `relatedAnimalId` on someone else's row) and returns one flat, display-ready list.
export async function getRelationshipsForAnimal(animalId: string): Promise<AnimalRelationshipDisplay[]> {
  const rows = await prisma.animalRelationship.findMany({
    where: { OR: [{ animalId }, { relatedAnimalId: animalId }] },
    include: { animal: true, relatedAnimal: true },
    orderBy: { createdAt: "asc" }
  })

  return rows.map((row) => {
    const forward = row.animalId === animalId
    const other = forward ? row.relatedAnimal : row.animal
    const label = LABELS[row.relationType][forward ? "forward" : "inverse"]
    return { id: row.id, label, otherAnimalId: other.id, otherAnimalName: other.name, notes: row.notes }
  })
}
