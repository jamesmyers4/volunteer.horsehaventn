import { prisma } from "@/lib/prisma"

export type FacilityTaskCategoryValue = "TROUGH_CLEAN" | "STALL_CLEAN" | "STALL_STRIP"
export type LocationTypeValue = "FIELD" | "BARN_STALL" | "SICK_BAY" | "ARENA" | "OTHER"
export type ShiftTypeValue = "AM" | "PM"

/**
 * App-side pairing rule (V3.md Session 2), not a DB constraint — same "app-side check over a
 * DB constraint for admin-entered/operational data" preference already used for Location's own
 * per-type field validation (src/app/locations/actions.ts). TROUGH_CLEAN only targets a FIELD;
 * STALL_CLEAN/STALL_STRIP only target a BARN_STALL; STALL_STRIP further requires the specific
 * target location's requiresStripClean flag (Remus's and Rowan's stalls today). Shared by both
 * the recurring-template action and the ad hoc/quick-add completion action, since the rule is
 * described as applying to what's "assignable/loggable" — both paths carry a category+location
 * pair to check.
 */
export function validateTaskLocationPairing(category: FacilityTaskCategoryValue, location: { type: LocationTypeValue; requiresStripClean: boolean }) {
  if (category === "TROUGH_CLEAN" && location.type !== "FIELD") {
    throw new Error("A TROUGH_CLEAN task can only target a FIELD location")
  }
  if ((category === "STALL_CLEAN" || category === "STALL_STRIP") && location.type !== "BARN_STALL") {
    throw new Error(`A ${category} task can only target a BARN_STALL location`)
  }
  if (category === "STALL_STRIP" && !location.requiresStripClean) {
    throw new Error("A STALL_STRIP task can only target a location with requiresStripClean set")
  }
}

// Matches the UTC-date-string convention used throughout (src/lib/checkin.ts's own startOfDay,
// src/app/checkin/actions.ts) — not locale/local-timezone Date components, which would resolve
// to a different calendar day (and therefore a different dayOfWeek) in non-UTC environments.
export function startOfDay(date: Date) {
  return new Date(date.toISOString().slice(0, 10))
}

export function dayOfWeekFor(date: Date) {
  return startOfDay(date).getUTCDay()
}

/**
 * Never pre-generated — a given day/shift's expected task list is derived at render time by
 * matching RecurringTaskTemplate rows against that date's dayOfWeek + shiftType, same
 * derive-don't-cache approach already used for current location (src/lib/locations.ts) and
 * tier (src/lib/tier.ts). `completed` is true as soon as at least one completion exists for
 * that template on that date/shift — logging a second completion for the same slot doesn't
 * flip it back to "pending" or produce a second, confusing row in the rendered list (V3.md's
 * own test-coverage requirement).
 */
export async function getExpectedFacilityTasks(date: Date, shiftType: ShiftTypeValue) {
  const day = startOfDay(date)
  const nextDay = new Date(day)
  nextDay.setUTCDate(nextDay.getUTCDate() + 1)
  const dayOfWeek = day.getUTCDay()

  const templates = await prisma.recurringTaskTemplate.findMany({
    where: { isActive: true, dayOfWeek, shiftType },
    include: { taskType: true, targetLocation: true },
    orderBy: [{ taskTypeId: "asc" }, { targetLocationId: "asc" }]
  })
  if (templates.length === 0) return []

  const completions = await prisma.facilityTaskCompletion.findMany({
    where: { templateId: { in: templates.map((t) => t.id) }, date: { gte: day, lt: nextDay }, shiftType }
  })

  return templates.map((template) => {
    const templateCompletions = completions.filter((c) => c.templateId === template.id)
    return { template, completions: templateCompletions, completed: templateCompletions.length > 0 }
  })
}

export type ExpectedFacilityTask = Awaited<ReturnType<typeof getExpectedFacilityTasks>>[number]

/**
 * V3.md Session 7: the Admin Console's monthly calendar view. Same derive-don't-cache
 * principle as getExpectedFacilityTasks above, just expanded across every date in a month
 * instead of a single day — RecurringTaskTemplate rows are still the only stored fact,
 * matched against each date's own dayOfWeek. Deliberately no shiftType filter (unlike
 * getExpectedFacilityTasks) since the calendar shows both AM and PM slots per day at once.
 */
export async function getRecurringTasksForMonth(monthStart: Date) {
  const year = monthStart.getUTCFullYear()
  const month = monthStart.getUTCMonth()
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

  const templates = await prisma.recurringTaskTemplate.findMany({
    where: { isActive: true },
    include: { taskType: true, targetLocation: true },
    orderBy: [{ shiftType: "asc" }, { taskTypeId: "asc" }]
  })

  const days = []
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(Date.UTC(year, month, day))
    const dayOfWeek = date.getUTCDay()
    days.push({ date, dayOfWeek, templates: templates.filter((t) => t.dayOfWeek === dayOfWeek) })
  }
  return days
}

export type MonthRecurringTasks = Awaited<ReturnType<typeof getRecurringTasksForMonth>>

// "YYYY-MM" query-param parsing for month-to-month calendar navigation — defaults to the
// current month (UTC, matching this file's own startOfDay convention) for a missing/malformed
// param rather than throwing, since a bad/absent query param shouldn't 500 the page.
export function parseMonthParam(monthParam: string | undefined, now: Date = new Date()) {
  if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
    const [year, month] = monthParam.split("-").map(Number)
    return new Date(Date.UTC(year, month - 1, 1))
  }
  const today = startOfDay(now)
  return new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1))
}

export function monthParamFor(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`
}
