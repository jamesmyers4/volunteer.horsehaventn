// V3.md Session 1: "HHT Days" (days at Horse Haven) from the real board. Computed at query
// time, never stored — same "computed-not-cached" convention as src/lib/tier.ts. Uses the
// latest still-active Placement (returnedDate null, if any) rather than the animal's current
// `status`, so a RETURNED animal's HHT Days correctly resumes counting from intake to today
// instead of freezing at a placement date that no longer applies.
export function computeHhtDays(
  intakeDate: Date | null,
  placements: { placedDate: Date; returnedDate: Date | null }[],
  today: Date = new Date()
): number | null {
  if (!intakeDate) return null

  const activePlacement = placements
    .filter((p) => !p.returnedDate)
    .sort((a, b) => b.placedDate.getTime() - a.placedDate.getTime())[0]

  const endDate = activePlacement ? activePlacement.placedDate : today
  const diffMs = endDate.getTime() - intakeDate.getTime()
  return Math.floor(diffMs / (1000 * 60 * 60 * 24))
}
