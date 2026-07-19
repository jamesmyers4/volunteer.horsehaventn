import { describe, it, expect } from "vitest"
import { isEligibleForEvent } from "@/lib/events"
import type { TierThresholdRow } from "@/lib/tier"

const THRESHOLDS: TierThresholdRow[] = [
  { tier: "GREEN", minDaysTenure: 0, requiresManualRelease: false },
  { tier: "ORANGE", minDaysTenure: 180, requiresManualRelease: false },
  { tier: "YELLOW", minDaysTenure: 365, requiresManualRelease: false },
  { tier: "BLUE", minDaysTenure: 730, requiresManualRelease: true }
]

const TODAY = new Date("2026-07-19")
const daysAgo = (days: number) => new Date(TODAY.getTime() - days * 24 * 60 * 60 * 1000)

const blueVolunteer = { firstShiftDate: daysAgo(1000), blueReleasedAt: daysAgo(100) }
const greenVolunteer = { firstShiftDate: daysAgo(10), blueReleasedAt: null }

describe("isEligibleForEvent", () => {
  it("has no requirements — everyone is eligible", () => {
    expect(isEligibleForEvent(greenVolunteer, { requiredTagId: null, requiredTier: null }, new Set(), THRESHOLDS, TODAY)).toBe(true)
  })

  it("requiredTagId — eligible when the volunteer actively holds the tag", () => {
    const eligible = isEligibleForEvent(greenVolunteer, { requiredTagId: "tag_1", requiredTier: null }, new Set(["tag_1"]), THRESHOLDS, TODAY)
    expect(eligible).toBe(true)
  })

  it("requiredTagId — ineligible when the volunteer doesn't hold the tag", () => {
    const eligible = isEligibleForEvent(greenVolunteer, { requiredTagId: "tag_1", requiredTier: null }, new Set(), THRESHOLDS, TODAY)
    expect(eligible).toBe(false)
  })

  it("requiredTier — a Blue volunteer meets a Blue-gated event (e.g. Blue Handler Class)", () => {
    const eligible = isEligibleForEvent(blueVolunteer, { requiredTagId: null, requiredTier: "BLUE" }, new Set(), THRESHOLDS, TODAY)
    expect(eligible).toBe(true)
  })

  it("requiredTier — a Green volunteer does not meet a Blue-gated event", () => {
    const eligible = isEligibleForEvent(greenVolunteer, { requiredTagId: null, requiredTier: "BLUE" }, new Set(), THRESHOLDS, TODAY)
    expect(eligible).toBe(false)
  })

  it("requiredTier — a higher-tier volunteer still meets a lower-tier requirement (floor, not exact match)", () => {
    const eligible = isEligibleForEvent(blueVolunteer, { requiredTagId: null, requiredTier: "YELLOW" }, new Set(), THRESHOLDS, TODAY)
    expect(eligible).toBe(true)
  })

  it("requiredTier — RED is never satisfiable (not a real volunteer progression tier)", () => {
    const eligible = isEligibleForEvent(blueVolunteer, { requiredTagId: null, requiredTier: "RED" }, new Set(), THRESHOLDS, TODAY)
    expect(eligible).toBe(false)
  })

  it("both requiredTagId and requiredTier set — requires BOTH (AND, not OR)", () => {
    const requirements = { requiredTagId: "tag_1", requiredTier: "BLUE" }
    expect(isEligibleForEvent(blueVolunteer, requirements, new Set(["tag_1"]), THRESHOLDS, TODAY)).toBe(true)
    expect(isEligibleForEvent(blueVolunteer, requirements, new Set(), THRESHOLDS, TODAY)).toBe(false)
    expect(isEligibleForEvent(greenVolunteer, requirements, new Set(["tag_1"]), THRESHOLDS, TODAY)).toBe(false)
  })
})
