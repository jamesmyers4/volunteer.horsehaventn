// V2.md Session 2: Green->Orange->Yellow->Blue tier computation. Deliberately pure and
// query-time-only — nothing here is cached on Volunteer, per V2.md's explicit "don't store a
// cached current tier that can drift" instruction. src/app/volunteers/[id]/page.tsx and
// src/app/checkin/actions.ts are the callers.

export type ProgressionTier = "GREEN" | "ORANGE" | "YELLOW" | "BLUE"

const TIER_ORDER: ProgressionTier[] = ["GREEN", "ORANGE", "YELLOW", "BLUE"]

export type TierThresholdRow = {
  // Widened to `string` rather than ProgressionTier: TierThreshold.tier is typed as the
  // full HandlingColor enum at the DB level (RED included, for the Animal-side reuse of
  // that enum — CONTEXT.md §6), even though only GREEN/ORANGE/YELLOW/BLUE rows ever exist.
  tier: string
  minDaysTenure: number
  requiresManualRelease: boolean
}

/** Whole days elapsed since firstShiftDate. Null firstShiftDate (no recorded shift yet) is zero tenure, per spec. */
export function tenureDays(firstShiftDate: Date | null, today: Date = new Date()): number {
  if (!firstShiftDate) return 0
  const ms = today.getTime() - firstShiftDate.getTime()
  return Math.max(0, Math.floor(ms / (24 * 60 * 60 * 1000)))
}

export type TierComputation = {
  tenureDays: number
  /** Highest tier whose tenure bar is cleared, considering only tiers that don't require manual release. */
  computedEligibleTier: ProgressionTier
  /** computedEligibleTier, except promoted to BLUE once tenure is met AND blueReleasedAt is set. */
  actualTier: ProgressionTier
  /** Whether tenure alone (ignoring release) has cleared BLUE's bar — used to gate releaseBlue(). */
  blueTenureMet: boolean
}

export function computeTiers(
  volunteer: { firstShiftDate: Date | null; blueReleasedAt: Date | null },
  thresholds: TierThresholdRow[],
  today: Date = new Date()
): TierComputation {
  const days = tenureDays(volunteer.firstShiftDate, today)
  const byTier = new Map(thresholds.map((t) => [t.tier, t]))

  const tenureMet = (tier: ProgressionTier) => days >= (byTier.get(tier)?.minDaysTenure ?? Infinity)

  let computedEligibleTier: ProgressionTier = "GREEN"
  for (const tier of TIER_ORDER) {
    const threshold = byTier.get(tier)
    if (threshold?.requiresManualRelease) continue
    if (tenureMet(tier)) computedEligibleTier = tier
  }

  const blueTenureMet = tenureMet("BLUE")
  const actualTier: ProgressionTier = blueTenureMet && volunteer.blueReleasedAt ? "BLUE" : computedEligibleTier

  return { tenureDays: days, computedEligibleTier, actualTier, blueTenureMet }
}
