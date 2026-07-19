// V2.md Session 5: seasonal shift-time resolution. Pure and side-effect-free, same
// "extract the derivation logic so it's exercised for real by both the UI and the tests"
// pattern as src/lib/tier.ts and src/lib/locations.ts — src/app/checkin/page.tsx,
// src/app/checkin/actions.ts, and src/app/kiosk/actions.ts are the callers.

export type ShiftTypeValue = "AM" | "PM"
export type FarmSeasonValue = "STANDARD" | "WINTER"

export type ShiftTemplateRow = {
  shiftType: ShiftTypeValue
  standardStartTime: string
  standardEndTime: string
  winterStartTime: string | null
  winterEndTime: string | null
}

export type TimeWindow = { start: string; end: string }

/** "09:00" -> 540 (minutes since midnight). */
export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number)
  return hours * 60 + minutes
}

/**
 * The template's resolved reference window for a season. Falls back to the standard
 * window if winter times aren't configured for this template — a template with no winter
 * override shouldn't crash the resolver, it just doesn't change for winter.
 */
export function resolveShiftTimes(template: ShiftTemplateRow, season: FarmSeasonValue): TimeWindow {
  if (season === "WINTER" && template.winterStartTime && template.winterEndTime) {
    return { start: template.winterStartTime, end: template.winterEndTime }
  }
  return { start: template.standardStartTime, end: template.standardEndTime }
}

/**
 * The resolved window for one specific day's occurrence — an explicit actualStartTime/
 * actualEndTime override on the Shift row (V2.md Session 5's per-occurrence correction,
 * "we ran late today") wins over the template's seasonal reference time.
 */
export function resolveShiftTimesForOccurrence(
  template: ShiftTemplateRow,
  occurrence: { actualStartTime: string | null; actualEndTime: string | null } | null,
  season: FarmSeasonValue
): TimeWindow {
  if (occurrence?.actualStartTime && occurrence?.actualEndTime) {
    return { start: occurrence.actualStartTime, end: occurrence.actualEndTime }
  }
  return resolveShiftTimes(template, season)
}

/**
 * Which shift (AM or PM) is "in progress" right now, for the kiosk's no-questions-asked
 * scan-to-toggle flow. Inside a resolved window -> that shift. Outside both -> whichever
 * window is closer in time, splitting the gap between AM's end and PM's start at its
 * midpoint. Requires at least one template; throws otherwise (shouldn't happen against a
 * seeded DB — see prisma/seed.ts).
 */
export function determineShiftTypeForNow(templates: ShiftTemplateRow[], season: FarmSeasonValue, now: Date = new Date()): ShiftTypeValue {
  if (templates.length === 0) throw new Error("No ShiftTemplate rows configured")

  const nowMinutes = now.getHours() * 60 + now.getMinutes()
  const windows = templates.map((template) => ({
    shiftType: template.shiftType,
    ...resolveShiftTimes(template, season)
  }))

  for (const window of windows) {
    if (nowMinutes >= parseTimeToMinutes(window.start) && nowMinutes <= parseTimeToMinutes(window.end)) {
      return window.shiftType
    }
  }

  const am = windows.find((w) => w.shiftType === "AM")
  const pm = windows.find((w) => w.shiftType === "PM")
  if (am && pm) {
    const midpoint = (parseTimeToMinutes(am.end) + parseTimeToMinutes(pm.start)) / 2
    return nowMinutes < midpoint ? "AM" : "PM"
  }

  return windows[0].shiftType
}
