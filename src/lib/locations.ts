import { prisma } from "@/lib/prisma"

// Shared by the animal detail page and its Vitest coverage (V2.md Session 1's
// "current-location derivation" test requirement) so the derivation logic is exercised
// for real rather than re-implemented in the test. Append-only: "current" is always the
// latest `effectiveAt` row per animal+period, never a stored pointer — see
// prisma/schema.prisma's comment on AnimalLocationAssignment.
export async function getLocationHistory(animalId: string) {
  return prisma.animalLocationAssignment.findMany({
    where: { animalId },
    include: { location: true },
    orderBy: { effectiveAt: "desc" }
  })
}

type LocationHistory = Awaited<ReturnType<typeof getLocationHistory>>

/** Derives current DAY/NIGHT assignments from an already-fetched, effectiveAt-desc history list. */
export function currentFromHistory(history: LocationHistory) {
  return {
    day: history.find((a) => a.period === "DAY"),
    night: history.find((a) => a.period === "NIGHT")
  }
}

export async function getCurrentLocationAssignments(animalId: string) {
  const history = await getLocationHistory(animalId)
  return currentFromHistory(history)
}
