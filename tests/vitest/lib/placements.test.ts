import { describe, it, expect } from "vitest"
import { computeHhtDays } from "@/lib/placements"

describe("computeHhtDays", () => {
  it("returns null when intakeDate is unknown", () => {
    expect(computeHhtDays(null, [])).toBeNull()
  })

  it("counts from intake to today when there is no active placement", () => {
    const intake = new Date("2026-01-01")
    const today = new Date("2026-01-11")
    expect(computeHhtDays(intake, [], today)).toBe(10)
  })

  it("counts from intake to placedDate once an active (not-returned) placement exists", () => {
    const intake = new Date("2026-01-01")
    const placedDate = new Date("2026-01-08")
    const today = new Date("2026-02-01")
    expect(computeHhtDays(intake, [{ placedDate, returnedDate: null }], today)).toBe(7)
  })

  it("resumes counting to today once a placement has been returned", () => {
    const intake = new Date("2026-01-01")
    const placedDate = new Date("2026-01-08")
    const returnedDate = new Date("2026-01-15")
    const today = new Date("2026-02-01")
    expect(computeHhtDays(intake, [{ placedDate, returnedDate }], today)).toBe(31)
  })

  it("uses the latest active placement when more than one exists", () => {
    const intake = new Date("2026-01-01")
    const earlier = new Date("2026-01-05")
    const later = new Date("2026-01-20")
    const today = new Date("2026-02-01")
    expect(
      computeHhtDays(
        intake,
        [
          { placedDate: earlier, returnedDate: null },
          { placedDate: later, returnedDate: null }
        ],
        today
      )
    ).toBe(19)
  })
})
