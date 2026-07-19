// V2.md Session 3: generic volunteer tagging + a simple admin-facing "eligibility
// candidates" report — a human-reviewed list, not an automatic gate. Only tags with
// minDaysSinceBlueRelease configured get a report; most tags won't need one.
import { prisma } from "@/lib/prisma"
import { computeTiers } from "@/lib/tier"

/**
 * Volunteers who are actualTier BLUE and have cleared the tag's configured tenure-since-
 * release bar, and don't already hold the tag. Read-only report for a human to act on —
 * never assigns the tag itself.
 */
export async function getTagEligibilityCandidates(tagId: string, today: Date = new Date()) {
  const tag = await prisma.volunteerTag.findUniqueOrThrow({ where: { id: tagId } })
  if (tag.minDaysSinceBlueRelease === null) return []

  const [volunteers, thresholds, activeAssignments] = await Promise.all([
    prisma.volunteer.findMany({ where: { status: "ACTIVE", blueReleasedAt: { not: null } } }),
    prisma.tierThreshold.findMany(),
    prisma.volunteerTagAssignment.findMany({ where: { tagId, removedAt: null }, select: { volunteerId: true } })
  ])
  const alreadyTagged = new Set(activeAssignments.map((a) => a.volunteerId))

  return volunteers.filter((volunteer) => {
    if (alreadyTagged.has(volunteer.id)) return false
    const { actualTier } = computeTiers(volunteer, thresholds, today)
    if (actualTier !== "BLUE") return false
    const daysSinceRelease = Math.floor((today.getTime() - volunteer.blueReleasedAt!.getTime()) / (24 * 60 * 60 * 1000))
    return daysSinceRelease >= tag.minDaysSinceBlueRelease!
  })
}
