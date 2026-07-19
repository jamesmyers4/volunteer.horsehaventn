import { describe, it, expect } from "vitest"
import { computeTiers, tenureDays, type TierThresholdRow } from "@/lib/tier"

const THRESHOLDS: TierThresholdRow[] = [
  { tier: "GREEN", minDaysTenure: 0, requiresManualRelease: false },
  { tier: "ORANGE", minDaysTenure: 180, requiresManualRelease: false },
  { tier: "YELLOW", minDaysTenure: 365, requiresManualRelease: false },
  { tier: "BLUE", minDaysTenure: 730, requiresManualRelease: true }
]

const TODAY = new Date("2026-07-18")

describe("tenureDays", () => {
  it("is zero when firstShiftDate is null — tenure clock hasn't started", () => {
    expect(tenureDays(null, TODAY)).toBe(0)
  })

  it("counts whole days elapsed since firstShiftDate", () => {
    expect(tenureDays(new Date("2026-01-18"), TODAY)).toBe(181)
  })
})

describe("computeTiers", () => {
  it("defaults a brand-new volunteer (no firstShiftDate) to GREEN", () => {
    const result = computeTiers({ firstShiftDate: null, blueReleasedAt: null }, THRESHOLDS, TODAY)
    expect(result.tenureDays).toBe(0)
    expect(result.computedEligibleTier).toBe("GREEN")
    expect(result.actualTier).toBe("GREEN")
    expect(result.blueTenureMet).toBe(false)
  })

  it("stays GREEN one day short of the Orange boundary (179 days)", () => {
    const firstShiftDate = new Date(TODAY.getTime() - 179 * 24 * 60 * 60 * 1000)
    const result = computeTiers({ firstShiftDate, blueReleasedAt: null }, THRESHOLDS, TODAY)
    expect(result.computedEligibleTier).toBe("GREEN")
  })

  it("reaches Orange exactly at the 180-day boundary", () => {
    const firstShiftDate = new Date(TODAY.getTime() - 180 * 24 * 60 * 60 * 1000)
    const result = computeTiers({ firstShiftDate, blueReleasedAt: null }, THRESHOLDS, TODAY)
    expect(result.computedEligibleTier).toBe("ORANGE")
  })

  it("reaches Yellow exactly at the 365-day boundary", () => {
    const firstShiftDate = new Date(TODAY.getTime() - 365 * 24 * 60 * 60 * 1000)
    const result = computeTiers({ firstShiftDate, blueReleasedAt: null }, THRESHOLDS, TODAY)
    expect(result.computedEligibleTier).toBe("YELLOW")
  })

  it("caps actualTier at Yellow once Blue's tenure is met but the volunteer hasn't been released", () => {
    const firstShiftDate = new Date(TODAY.getTime() - 730 * 24 * 60 * 60 * 1000)
    const result = computeTiers({ firstShiftDate, blueReleasedAt: null }, THRESHOLDS, TODAY)
    expect(result.blueTenureMet).toBe(true)
    expect(result.computedEligibleTier).toBe("YELLOW")
    expect(result.actualTier).toBe("YELLOW")
  })

  it("reaches Blue only when tenure is met AND blueReleasedAt is set", () => {
    const firstShiftDate = new Date(TODAY.getTime() - 730 * 24 * 60 * 60 * 1000)
    const result = computeTiers({ firstShiftDate, blueReleasedAt: new Date("2026-07-01") }, THRESHOLDS, TODAY)
    expect(result.actualTier).toBe("BLUE")
  })

  it("does not reach Blue on release alone if tenure isn't met yet", () => {
    const firstShiftDate = new Date(TODAY.getTime() - 400 * 24 * 60 * 60 * 1000)
    const result = computeTiers({ firstShiftDate, blueReleasedAt: new Date("2026-07-01") }, THRESHOLDS, TODAY)
    expect(result.blueTenureMet).toBe(false)
    expect(result.actualTier).toBe("YELLOW")
  })
})
