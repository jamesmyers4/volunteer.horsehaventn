import { describe, it, expect } from "vitest"
import { resolveShiftTimes, resolveShiftTimesForOccurrence, determineShiftTypeForNow, parseTimeToMinutes } from "@/lib/shifts"

const amTemplate = { shiftType: "AM" as const, standardStartTime: "09:00", standardEndTime: "11:00", winterStartTime: "10:00", winterEndTime: "12:00" }
const pmTemplate = { shiftType: "PM" as const, standardStartTime: "16:00", standardEndTime: "19:00", winterStartTime: "15:00", winterEndTime: "18:00" }
const noWinterTemplate = { shiftType: "AM" as const, standardStartTime: "09:00", standardEndTime: "11:00", winterStartTime: null, winterEndTime: null }

describe("parseTimeToMinutes", () => {
  it("converts HH:MM to minutes since midnight", () => {
    expect(parseTimeToMinutes("00:00")).toBe(0)
    expect(parseTimeToMinutes("09:30")).toBe(570)
    expect(parseTimeToMinutes("23:59")).toBe(1439)
  })
})

describe("resolveShiftTimes", () => {
  it("returns the standard window in STANDARD season", () => {
    expect(resolveShiftTimes(amTemplate, "STANDARD")).toEqual({ start: "09:00", end: "11:00" })
  })

  it("returns the winter window in WINTER season when configured", () => {
    expect(resolveShiftTimes(amTemplate, "WINTER")).toEqual({ start: "10:00", end: "12:00" })
  })

  it("falls back to standard in WINTER season when no winter window is configured", () => {
    expect(resolveShiftTimes(noWinterTemplate, "WINTER")).toEqual({ start: "09:00", end: "11:00" })
  })
})

describe("resolveShiftTimesForOccurrence", () => {
  it("uses the template's resolved window when no occurrence override exists", () => {
    expect(resolveShiftTimesForOccurrence(amTemplate, null, "STANDARD")).toEqual({ start: "09:00", end: "11:00" })
  })

  it("prefers an occurrence's actualStartTime/actualEndTime over the template", () => {
    const occurrence = { actualStartTime: "09:20", actualEndTime: "11:10" }
    expect(resolveShiftTimesForOccurrence(amTemplate, occurrence, "STANDARD")).toEqual({ start: "09:20", end: "11:10" })
  })

  it("falls back to the template when the occurrence has only one of the two override fields set", () => {
    const occurrence = { actualStartTime: "09:20", actualEndTime: null }
    expect(resolveShiftTimesForOccurrence(amTemplate, occurrence, "STANDARD")).toEqual({ start: "09:00", end: "11:00" })
  })
})

describe("determineShiftTypeForNow", () => {
  const templates = [amTemplate, pmTemplate]

  it("picks AM when now falls inside the AM window", () => {
    const now = new Date(2026, 0, 1, 9, 30)
    expect(determineShiftTypeForNow(templates, "STANDARD", now)).toBe("AM")
  })

  it("picks PM when now falls inside the PM window", () => {
    const now = new Date(2026, 0, 1, 17, 0)
    expect(determineShiftTypeForNow(templates, "STANDARD", now)).toBe("PM")
  })

  it("picks AM when now is in the gap before the midpoint between AM's end and PM's start", () => {
    // AM ends 11:00, PM starts 16:00 -> midpoint 13:30
    const now = new Date(2026, 0, 1, 12, 0)
    expect(determineShiftTypeForNow(templates, "STANDARD", now)).toBe("AM")
  })

  it("picks PM when now is in the gap after the midpoint", () => {
    const now = new Date(2026, 0, 1, 14, 0)
    expect(determineShiftTypeForNow(templates, "STANDARD", now)).toBe("PM")
  })

  it("picks PM for a late-night time after both windows have closed", () => {
    const now = new Date(2026, 0, 1, 22, 0)
    expect(determineShiftTypeForNow(templates, "STANDARD", now)).toBe("PM")
  })

  it("picks AM for an early-morning time before both windows have opened", () => {
    const now = new Date(2026, 0, 1, 5, 0)
    expect(determineShiftTypeForNow(templates, "STANDARD", now)).toBe("AM")
  })

  it("resolves against the WINTER window, not STANDARD, when the season is WINTER", () => {
    // Winter AM is 10:00-12:00 — 09:30 is inside standard AM but outside winter AM, so with
    // only AM/PM templates and winter PM starting 15:00, 09:30 falls in the "before AM opens"
    // gap and should still resolve to AM (closer to AM's winter start than PM's).
    const now = new Date(2026, 0, 1, 9, 30)
    expect(determineShiftTypeForNow(templates, "WINTER", now)).toBe("AM")
  })

  it("throws if no templates are configured", () => {
    expect(() => determineShiftTypeForNow([], "STANDARD", new Date())).toThrow("No ShiftTemplate")
  })
})
