// V2.md Session 4: self-service event signup. Gating (requiredTagId/requiredTier) has to be
// enforced in two places that must agree — hidden from listings, and rejected server-side on
// a direct signup attempt — so the actual eligibility check lives here once, pure and
// testable, rather than duplicated inline in the list page and the signup action.
import { prisma } from "@/lib/prisma"
import { computeTiers, tierAtLeast, TIER_ORDER, type TierThresholdRow } from "@/lib/tier"

export type EventGateVolunteer = {
  firstShiftDate: Date | null
  blueReleasedAt: Date | null
}

export type EventGateRequirements = {
  requiredTagId: string | null
  // Widened to `string` rather than `ProgressionTier`: Event.requiredTier reuses the full
  // HandlingColor enum at the DB level (RED included, same reasoning TierThreshold.tier
  // already documents), even though only GREEN/ORANGE/YELLOW/BLUE are meaningful volunteer-
  // progression gates. RED isn't a real tier a volunteer can hold, so it's treated below as
  // never satisfiable rather than a TypeScript-level impossibility.
  requiredTier: string | null
}

/**
 * When both requiredTagId and requiredTier are set on an event, a volunteer must satisfy
 * both (AND) — V2.md's only worked example (Blue Handler Class) sets just requiredTier, so
 * this AND behavior for the combined case is this session's own interpretation, not a
 * confirmed requirement (flagged in HANDOFF.md).
 */
export function isEligibleForEvent(
  volunteer: EventGateVolunteer,
  requirements: EventGateRequirements,
  activeTagIds: Set<string>,
  thresholds: TierThresholdRow[],
  today: Date = new Date()
): boolean {
  if (requirements.requiredTagId && !activeTagIds.has(requirements.requiredTagId)) return false
  if (requirements.requiredTier) {
    if (!TIER_ORDER.includes(requirements.requiredTier as (typeof TIER_ORDER)[number])) return false
    const { actualTier } = computeTiers(volunteer, thresholds, today)
    if (!tierAtLeast(actualTier, requirements.requiredTier as (typeof TIER_ORDER)[number])) return false
  }
  return true
}

/** Fetches what isEligibleForEvent() needs for a single volunteer and evaluates it. */
export async function checkEventEligibility(volunteerId: string, requirements: EventGateRequirements, today: Date = new Date()) {
  const [volunteer, thresholds, activeTags] = await Promise.all([
    prisma.volunteer.findUniqueOrThrow({ where: { id: volunteerId } }),
    prisma.tierThreshold.findMany(),
    prisma.volunteerTagAssignment.findMany({ where: { volunteerId, removedAt: null }, select: { tagId: true } })
  ])
  const activeTagIds = new Set(activeTags.map((t) => t.tagId))
  return isEligibleForEvent(volunteer, requirements, activeTagIds, thresholds, today)
}
