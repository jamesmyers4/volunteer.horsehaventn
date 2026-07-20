import { describe, it, expect } from "vitest"
import { getRecurringTasksForMonth, parseMonthParam, monthParamFor } from "@/lib/facilityTasks"
import { prisma } from "@/lib/prisma"
import { getFacilityTaskType, getLocation } from "../helpers/factories"

describe("parseMonthParam", () => {
  it("parses a well-formed YYYY-MM param into the first of that UTC month", () => {
    expect(parseMonthParam("2026-03")).toEqual(new Date(Date.UTC(2026, 2, 1)))
  })

  it("falls back to the current UTC month for a missing param", () => {
    const now = new Date("2026-07-20T15:00:00Z")
    expect(parseMonthParam(undefined, now)).toEqual(new Date(Date.UTC(2026, 6, 1)))
  })

  it("falls back to the current UTC month for a malformed param rather than throwing", () => {
    const now = new Date("2026-07-20T15:00:00Z")
    expect(parseMonthParam("not-a-month", now)).toEqual(new Date(Date.UTC(2026, 6, 1)))
  })
})

describe("monthParamFor", () => {
  it("formats a date as YYYY-MM, zero-padding single-digit months", () => {
    expect(monthParamFor(new Date(Date.UTC(2026, 0, 1)))).toBe("2026-01")
    expect(monthParamFor(new Date(Date.UTC(2026, 10, 1)))).toBe("2026-11")
  })
})

describe("getRecurringTasksForMonth", () => {
  it("expands a recurring template onto every matching weekday in the month, and no others", async () => {
    const taskType = await getFacilityTaskType("TROUGH_CLEAN")
    const location = await getLocation("L1")
    // 2026-07-01 is a Wednesday (dayOfWeek 3) — assign a Wednesday AM slot and confirm it
    // shows up on every Wednesday in July 2026, and on no other day.
    await prisma.recurringTaskTemplate.create({
      data: { taskTypeId: taskType.id, targetLocationId: location.id, dayOfWeek: 3, shiftType: "AM" }
    })

    const days = await getRecurringTasksForMonth(new Date(Date.UTC(2026, 6, 1)))

    expect(days).toHaveLength(31)
    const wednesdays = days.filter((d) => d.dayOfWeek === 3)
    expect(wednesdays.length).toBeGreaterThan(0)
    for (const day of wednesdays) {
      expect(day.templates.some((t) => t.targetLocationId === location.id)).toBe(true)
    }
    const nonWednesdays = days.filter((d) => d.dayOfWeek !== 3)
    for (const day of nonWednesdays) {
      expect(day.templates.some((t) => t.targetLocationId === location.id)).toBe(false)
    }
  })

  it("excludes a deactivated template from the expanded month", async () => {
    const taskType = await getFacilityTaskType("STALL_CLEAN")
    const stall = await prisma.location.create({
      data: { type: "BARN_STALL", name: `Test Stall ${Math.random().toString(36).slice(2, 8)}`, barnNumber: 2, stallNumber: Math.floor(Math.random() * 100000) }
    })
    await prisma.recurringTaskTemplate.create({
      data: { taskTypeId: taskType.id, targetLocationId: stall.id, dayOfWeek: 1, shiftType: "PM", isActive: false }
    })

    const days = await getRecurringTasksForMonth(new Date(Date.UTC(2026, 6, 1)))
    expect(days.every((d) => d.templates.every((t) => t.targetLocationId !== stall.id))).toBe(true)
  })

  it("returns both AM and PM slots for the same day, unlike the single-shift daily view", async () => {
    const troughType = await getFacilityTaskType("TROUGH_CLEAN")
    const location = await getLocation("L2")
    await prisma.recurringTaskTemplate.create({
      data: { taskTypeId: troughType.id, targetLocationId: location.id, dayOfWeek: 3, shiftType: "AM" }
    })
    await prisma.recurringTaskTemplate.create({
      data: { taskTypeId: troughType.id, targetLocationId: location.id, dayOfWeek: 3, shiftType: "PM" }
    })

    const days = await getRecurringTasksForMonth(new Date(Date.UTC(2026, 6, 1)))
    const firstWednesday = days.find((d) => d.dayOfWeek === 3)!
    const shiftsForLocation = firstWednesday.templates.filter((t) => t.targetLocationId === location.id).map((t) => t.shiftType)
    expect(shiftsForLocation.sort()).toEqual(["AM", "PM"])
  })
})
