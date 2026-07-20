import { describe, it, expect } from "vitest"
import { createRecurringTaskTemplate, updateRecurringTaskTemplate, logFacilityTaskCompletion } from "@/app/facility-tasks/actions"
import { getExpectedFacilityTasks, validateTaskLocationPairing, dayOfWeekFor } from "@/lib/facilityTasks"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs } from "../helpers/auth-mock"
import { createVolunteer, getLocation, getFacilityTaskType } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

// A strip stall and a regular (non-strip) stall, created fresh per test file run since
// Location is a lookup table never truncated between tests (tests/vitest/helpers/db.ts).
async function createBarnStall(requiresStripClean: boolean) {
  return prisma.location.create({
    data: {
      type: "BARN_STALL",
      name: `Test Stall ${Math.random().toString(36).slice(2, 8)}`,
      barnNumber: 1,
      stallNumber: Math.floor(Math.random() * 100000),
      requiresStripClean
    }
  })
}

describe("validateTaskLocationPairing", () => {
  it("allows TROUGH_CLEAN against a FIELD location", () => {
    expect(() => validateTaskLocationPairing("TROUGH_CLEAN", { type: "FIELD", requiresStripClean: false })).not.toThrow()
  })

  it("rejects TROUGH_CLEAN against a BARN_STALL location", () => {
    expect(() => validateTaskLocationPairing("TROUGH_CLEAN", { type: "BARN_STALL", requiresStripClean: false })).toThrow(
      "TROUGH_CLEAN task can only target a FIELD location"
    )
  })

  it("rejects STALL_CLEAN against a FIELD location", () => {
    expect(() => validateTaskLocationPairing("STALL_CLEAN", { type: "FIELD", requiresStripClean: false })).toThrow(
      "STALL_CLEAN task can only target a BARN_STALL location"
    )
  })

  it("allows STALL_CLEAN against any BARN_STALL, strip-required or not", () => {
    expect(() => validateTaskLocationPairing("STALL_CLEAN", { type: "BARN_STALL", requiresStripClean: false })).not.toThrow()
    expect(() => validateTaskLocationPairing("STALL_CLEAN", { type: "BARN_STALL", requiresStripClean: true })).not.toThrow()
  })

  it("rejects STALL_STRIP against a BARN_STALL that doesn't require strip cleaning", () => {
    expect(() => validateTaskLocationPairing("STALL_STRIP", { type: "BARN_STALL", requiresStripClean: false })).toThrow(
      "STALL_STRIP task can only target a location with requiresStripClean set"
    )
  })

  it("allows STALL_STRIP against a BARN_STALL that requires strip cleaning", () => {
    expect(() => validateTaskLocationPairing("STALL_STRIP", { type: "BARN_STALL", requiresStripClean: true })).not.toThrow()
  })
})

describe("createRecurringTaskTemplate", () => {
  it("is Admin-or-Shift-Lead — a plain Volunteer is rejected and nothing is written", async () => {
    const taskType = await getFacilityTaskType("TROUGH_CLEAN")
    const location = await getLocation("L1")
    await createVolunteer({ clerkId: "clerk_vol_ftt1", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_ftt1")

    await expect(
      createRecurringTaskTemplate(formData({ taskTypeId: taskType.id, targetLocationId: location.id, dayOfWeek: "1", shiftType: "AM" }))
    ).rejects.toThrow("Not authorized")
    expect(await prisma.recurringTaskTemplate.count({ where: { taskTypeId: taskType.id, targetLocationId: location.id } })).toBe(0)
  })

  it("lets a Shift Lead create a TROUGH_CLEAN template against a FIELD location", async () => {
    const taskType = await getFacilityTaskType("TROUGH_CLEAN")
    const location = await getLocation("L2")
    await createVolunteer({ clerkId: "clerk_lead_ftt1", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_ftt1")

    const url = await captureRedirect(() =>
      createRecurringTaskTemplate(formData({ taskTypeId: taskType.id, targetLocationId: location.id, dayOfWeek: "3", shiftType: "AM" }))
    )

    expect(url).toBe("/facility-tasks")
    const template = await prisma.recurringTaskTemplate.findFirstOrThrow({ where: { taskTypeId: taskType.id, targetLocationId: location.id } })
    expect(template.dayOfWeek).toBe(3)
    expect(template.shiftType).toBe("AM")
    expect(template.isActive).toBe(true)
  })

  it("rejects a TROUGH_CLEAN template targeting a BARN_STALL location", async () => {
    const taskType = await getFacilityTaskType("TROUGH_CLEAN")
    const stall = await createBarnStall(false)
    await createVolunteer({ clerkId: "clerk_admin_ftt1", role: "ADMIN" })
    mockSignedInAs("clerk_admin_ftt1")

    await expect(
      createRecurringTaskTemplate(formData({ taskTypeId: taskType.id, targetLocationId: stall.id, dayOfWeek: "1", shiftType: "AM" }))
    ).rejects.toThrow("A TROUGH_CLEAN task can only target a FIELD location")
    expect(await prisma.recurringTaskTemplate.count({ where: { targetLocationId: stall.id } })).toBe(0)
  })

  it("rejects a STALL_STRIP template targeting a stall that doesn't require strip cleaning", async () => {
    const taskType = await getFacilityTaskType("STALL_STRIP")
    const stall = await createBarnStall(false)
    await createVolunteer({ clerkId: "clerk_admin_ftt2", role: "ADMIN" })
    mockSignedInAs("clerk_admin_ftt2")

    await expect(
      createRecurringTaskTemplate(formData({ taskTypeId: taskType.id, targetLocationId: stall.id, dayOfWeek: "1", shiftType: "PM" }))
    ).rejects.toThrow("requiresStripClean")
  })

  it("allows a STALL_STRIP template targeting a stall that does require strip cleaning", async () => {
    const taskType = await getFacilityTaskType("STALL_STRIP")
    const stall = await createBarnStall(true)
    await createVolunteer({ clerkId: "clerk_admin_ftt3", role: "ADMIN" })
    mockSignedInAs("clerk_admin_ftt3")

    await captureRedirect(() =>
      createRecurringTaskTemplate(formData({ taskTypeId: taskType.id, targetLocationId: stall.id, dayOfWeek: "1", shiftType: "PM" }))
    )

    const template = await prisma.recurringTaskTemplate.findFirstOrThrow({ where: { targetLocationId: stall.id } })
    expect(template.taskTypeId).toBe(taskType.id)
  })
})

describe("updateRecurringTaskTemplate", () => {
  it("is Admin-or-Shift-Lead — a plain Volunteer is rejected", async () => {
    const taskType = await getFacilityTaskType("TROUGH_CLEAN")
    const location = await getLocation("L3")
    const template = await prisma.recurringTaskTemplate.create({
      data: { taskTypeId: taskType.id, targetLocationId: location.id, dayOfWeek: 2, shiftType: "AM" }
    })
    await createVolunteer({ clerkId: "clerk_vol_ftt2", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_ftt2")

    await expect(
      updateRecurringTaskTemplate(
        template.id,
        formData({ taskTypeId: taskType.id, targetLocationId: location.id, dayOfWeek: "2", shiftType: "AM" })
      )
    ).rejects.toThrow("Not authorized")
  })

  it("deactivates a template via isActive rather than deleting it — no hard deletes", async () => {
    const taskType = await getFacilityTaskType("TROUGH_CLEAN")
    const location = await getLocation("L4")
    const template = await prisma.recurringTaskTemplate.create({
      data: { taskTypeId: taskType.id, targetLocationId: location.id, dayOfWeek: 4, shiftType: "PM" }
    })
    await createVolunteer({ clerkId: "clerk_admin_ftt4", role: "ADMIN" })
    mockSignedInAs("clerk_admin_ftt4")

    await captureRedirect(() =>
      updateRecurringTaskTemplate(
        template.id,
        formData({ taskTypeId: taskType.id, targetLocationId: location.id, dayOfWeek: "4", shiftType: "PM" })
      )
    )

    const updated = await prisma.recurringTaskTemplate.findUniqueOrThrow({ where: { id: template.id } })
    expect(updated.isActive).toBe(false)
    expect(await prisma.recurringTaskTemplate.count({ where: { id: template.id } })).toBe(1)
  })
})

describe("getExpectedFacilityTasks — weekday/shift expansion", () => {
  it("returns a template matching the given date's dayOfWeek + shiftType, and excludes non-matching days", async () => {
    const taskType = await getFacilityTaskType("TROUGH_CLEAN")
    const location = await getLocation("L5")
    const referenceDate = new Date("2026-07-20")
    const matchingDayOfWeek = dayOfWeekFor(referenceDate)

    await prisma.recurringTaskTemplate.create({
      data: { taskTypeId: taskType.id, targetLocationId: location.id, dayOfWeek: matchingDayOfWeek, shiftType: "AM" }
    })

    const onDay = await getExpectedFacilityTasks(referenceDate, "AM")
    expect(onDay.some((t) => t.template.targetLocationId === location.id)).toBe(true)

    const differentDay = new Date(referenceDate)
    differentDay.setUTCDate(differentDay.getUTCDate() + 1)
    const offDay = await getExpectedFacilityTasks(differentDay, "AM")
    expect(offDay.some((t) => t.template.targetLocationId === location.id)).toBe(false)

    const differentShift = await getExpectedFacilityTasks(referenceDate, "PM")
    expect(differentShift.some((t) => t.template.targetLocationId === location.id)).toBe(false)
  })

  it("excludes an inactive (deactivated) template from the expected list", async () => {
    const taskType = await getFacilityTaskType("TROUGH_CLEAN")
    const location = await getLocation("L6")
    const referenceDate = new Date("2026-07-21")
    const dayOfWeek = dayOfWeekFor(referenceDate)

    await prisma.recurringTaskTemplate.create({
      data: { taskTypeId: taskType.id, targetLocationId: location.id, dayOfWeek, shiftType: "PM", isActive: false }
    })

    const expected = await getExpectedFacilityTasks(referenceDate, "PM")
    expect(expected.some((t) => t.template.targetLocationId === location.id)).toBe(false)
  })
})

describe("logFacilityTaskCompletion — ad hoc quick-add", () => {
  it("any signed-in Volunteer can log an ad hoc completion with no templateId", async () => {
    const taskType = await getFacilityTaskType("TROUGH_CLEAN")
    const location = await getLocation("RP1")
    const volunteer = await createVolunteer({ clerkId: "clerk_vol_ftc1", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_ftc1")

    const url = await captureRedirect(() =>
      logFacilityTaskCompletion(
        formData({ taskTypeId: taskType.id, targetLocationId: location.id, date: "2026-07-20", shiftType: "AM", notes: "topped off" })
      )
    )

    expect(url).toBe("/facility-tasks")
    const completion = await prisma.facilityTaskCompletion.findFirstOrThrow({ where: { targetLocationId: location.id } })
    expect(completion.templateId).toBeNull()
    expect(completion.completedById).toBe(volunteer.id)
    expect(completion.notes).toBe("topped off")
  })

  it("rejects an ad hoc STALL_STRIP completion against a location that doesn't require strip cleaning", async () => {
    const taskType = await getFacilityTaskType("STALL_STRIP")
    const stall = await createBarnStall(false)
    await createVolunteer({ clerkId: "clerk_vol_ftc2", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_ftc2")

    await expect(
      logFacilityTaskCompletion(formData({ taskTypeId: taskType.id, targetLocationId: stall.id, date: "2026-07-20", shiftType: "PM" }))
    ).rejects.toThrow("requiresStripClean")
    expect(await prisma.facilityTaskCompletion.count({ where: { targetLocationId: stall.id } })).toBe(0)
  })
})

describe("logFacilityTaskCompletion — checking off a recurring template", () => {
  it("marks the template completed for that date/shift, re-deriving taskType/location from the template itself", async () => {
    const taskType = await getFacilityTaskType("STALL_CLEAN")
    const stall = await createBarnStall(false)
    const referenceDate = new Date("2026-07-22")
    const dayOfWeek = dayOfWeekFor(referenceDate)
    const template = await prisma.recurringTaskTemplate.create({
      data: { taskTypeId: taskType.id, targetLocationId: stall.id, dayOfWeek, shiftType: "AM" }
    })
    await createVolunteer({ clerkId: "clerk_vol_ftc3", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_ftc3")

    const before = await getExpectedFacilityTasks(referenceDate, "AM")
    expect(before.find((t) => t.template.id === template.id)?.completed).toBe(false)

    await captureRedirect(() => logFacilityTaskCompletion(formData({ templateId: template.id, date: "2026-07-22" })))

    const after = await getExpectedFacilityTasks(referenceDate, "AM")
    const afterEntry = after.find((t) => t.template.id === template.id)
    expect(afterEntry?.completed).toBe(true)
    expect(afterEntry?.completions[0].taskTypeId).toBe(taskType.id)
    expect(afterEntry?.completions[0].targetLocationId).toBe(stall.id)
  })

  // V3.md's own test-coverage requirement: completing the same recurring task twice on the
  // same day/shift shouldn't produce a confusing duplicate "still pending" state — a second
  // completion is allowed (not blocked) but the derived status stays a single "completed",
  // not a flip back to pending or a second visible pending row.
  it("completing the same template twice on the same day/shift doesn't flip status back to pending", async () => {
    const taskType = await getFacilityTaskType("STALL_CLEAN")
    const stall = await createBarnStall(false)
    const referenceDate = new Date("2026-07-23")
    const dayOfWeek = dayOfWeekFor(referenceDate)
    const template = await prisma.recurringTaskTemplate.create({
      data: { taskTypeId: taskType.id, targetLocationId: stall.id, dayOfWeek, shiftType: "PM" }
    })
    await createVolunteer({ clerkId: "clerk_vol_ftc4", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_ftc4")

    await captureRedirect(() => logFacilityTaskCompletion(formData({ templateId: template.id, date: "2026-07-23" })))
    await captureRedirect(() => logFacilityTaskCompletion(formData({ templateId: template.id, date: "2026-07-23" })))

    const expected = await getExpectedFacilityTasks(referenceDate, "PM")
    const matches = expected.filter((t) => t.template.id === template.id)
    expect(matches).toHaveLength(1)
    expect(matches[0].completed).toBe(true)
    expect(matches[0].completions).toHaveLength(2)
  })
})
