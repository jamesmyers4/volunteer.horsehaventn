import { describe, it, expect, beforeEach } from "vitest"
import { assignShiftLead, submitRosterAttendance } from "@/app/checkin/roster/actions"
import { updateOwnCheckIn } from "@/app/checkin/actions"
import { getDefaultRoster, canManageShiftRoster, dayOfWeekFor } from "@/lib/shiftRoster"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs } from "../helpers/auth-mock"
import { createVolunteer } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

// FarmSettings is a lookup/config row (tests/vitest/helpers/db.ts), not truncated between
// tests — force it to STANDARD before each test here, same precedent kiosk.test.ts already
// established, so time-resolution assertions below are deterministic regardless of what an
// earlier test left it as.
beforeEach(async () => {
  const settings = await prisma.farmSettings.findFirstOrThrow()
  await prisma.farmSettings.update({ where: { id: settings.id }, data: { activeSeason: "STANDARD" } })
})

// A Monday, chosen arbitrarily and computed via dayOfWeekFor rather than hardcoded, so the
// RegularShiftAssignment rows below always match regardless of which weekday this actually is.
const REFERENCE_DATE_STRING = "2026-07-20"
const REFERENCE_DATE = new Date(REFERENCE_DATE_STRING)
const REFERENCE_DAY_OF_WEEK = dayOfWeekFor(REFERENCE_DATE)

async function createRegularAssignment(volunteerId: string, overrides: Partial<{ active: boolean; dayOfWeek: number; shiftType: "AM" | "PM"; startDate: Date; endDate: Date | null }> = {}) {
  return prisma.regularShiftAssignment.create({
    data: {
      volunteerId,
      dayOfWeek: overrides.dayOfWeek ?? REFERENCE_DAY_OF_WEEK,
      shiftType: overrides.shiftType ?? "AM",
      active: overrides.active ?? true,
      startDate: overrides.startDate ?? new Date("2026-01-01"),
      endDate: overrides.endDate
    }
  })
}

describe("getDefaultRoster", () => {
  it("includes a volunteer with a matching active RegularShiftAssignment", async () => {
    const volunteer = await createVolunteer({ name: "Regular Rosa" })
    await createRegularAssignment(volunteer.id)

    const { roster } = await getDefaultRoster(REFERENCE_DATE, "AM")

    const entry = roster.find((r) => r.volunteerId === volunteer.id)
    expect(entry).toBeDefined()
    expect(entry?.fromRegularAssignment).toBe(true)
    expect(entry?.checkIn).toBeNull()
  })

  it("excludes a RegularShiftAssignment on a different dayOfWeek", async () => {
    const volunteer = await createVolunteer({ name: "Wrong Day" })
    await createRegularAssignment(volunteer.id, { dayOfWeek: (REFERENCE_DAY_OF_WEEK + 1) % 7 })

    const { roster } = await getDefaultRoster(REFERENCE_DATE, "AM")
    expect(roster.some((r) => r.volunteerId === volunteer.id)).toBe(false)
  })

  it("excludes a RegularShiftAssignment for a different shiftType", async () => {
    const volunteer = await createVolunteer({ name: "Wrong Shift" })
    await createRegularAssignment(volunteer.id, { shiftType: "PM" })

    const { roster } = await getDefaultRoster(REFERENCE_DATE, "AM")
    expect(roster.some((r) => r.volunteerId === volunteer.id)).toBe(false)
  })

  it("excludes an inactive RegularShiftAssignment", async () => {
    const volunteer = await createVolunteer({ name: "Inactive Ivy" })
    await createRegularAssignment(volunteer.id, { active: false })

    const { roster } = await getDefaultRoster(REFERENCE_DATE, "AM")
    expect(roster.some((r) => r.volunteerId === volunteer.id)).toBe(false)
  })

  it("excludes a RegularShiftAssignment whose endDate is before the given date", async () => {
    const volunteer = await createVolunteer({ name: "Ended Emma" })
    await createRegularAssignment(volunteer.id, { endDate: new Date("2026-06-01") })

    const { roster } = await getDefaultRoster(REFERENCE_DATE, "AM")
    expect(roster.some((r) => r.volunteerId === volunteer.id)).toBe(false)
  })

  it("includes a walk-on who already has a CheckIn for this Shift but no RegularShiftAssignment", async () => {
    const volunteer = await createVolunteer({ name: "Walkon Wendy" })
    const workType = await prisma.workType.findFirstOrThrow({ where: { name: "Regular Shift" } })
    const shift = await prisma.shift.create({ data: { date: REFERENCE_DATE, type: "AM" } })
    await prisma.checkIn.create({
      data: {
        volunteerId: volunteer.id,
        shiftId: shift.id,
        workTypeId: workType.id,
        checkInAt: new Date(`${REFERENCE_DATE_STRING}T09:05:00`),
        checkInMethod: "QR"
      }
    })

    const { roster } = await getDefaultRoster(REFERENCE_DATE, "AM")
    const entry = roster.find((r) => r.volunteerId === volunteer.id)
    expect(entry).toBeDefined()
    expect(entry?.fromRegularAssignment).toBe(false)
    expect(entry?.checkIn?.checkInMethod).toBe("QR")
  })

  it("merges a regular-roster volunteer who has already self-checked-in — one entry, checkIn populated", async () => {
    const volunteer = await createVolunteer({ name: "Both Bella" })
    await createRegularAssignment(volunteer.id)
    const workType = await prisma.workType.findFirstOrThrow({ where: { name: "Regular Shift" } })
    const shift = await prisma.shift.create({ data: { date: REFERENCE_DATE, type: "AM" } })
    await prisma.checkIn.create({
      data: {
        volunteerId: volunteer.id,
        shiftId: shift.id,
        workTypeId: workType.id,
        checkInAt: new Date(`${REFERENCE_DATE_STRING}T09:05:00`),
        checkInMethod: "KIOSK"
      }
    })

    const { roster } = await getDefaultRoster(REFERENCE_DATE, "AM")
    const matches = roster.filter((r) => r.volunteerId === volunteer.id)
    expect(matches).toHaveLength(1)
    expect(matches[0].fromRegularAssignment).toBe(true)
    expect(matches[0].checkIn?.checkInMethod).toBe("KIOSK")
  })
})

describe("canManageShiftRoster", () => {
  it("allows global ADMIN and SHIFT_LEAD regardless of assignedLeadId", () => {
    expect(canManageShiftRoster({ id: "x", role: "ADMIN" }, null)).toBe(true)
    expect(canManageShiftRoster({ id: "x", role: "SHIFT_LEAD" }, { assignedLeadId: "someone-else" })).toBe(true)
  })

  it("allows a plain VOLUNTEER who is the shift's assignedLeadId", () => {
    expect(canManageShiftRoster({ id: "vol-1", role: "VOLUNTEER" }, { assignedLeadId: "vol-1" })).toBe(true)
  })

  it("rejects a plain VOLUNTEER who isn't the assigned lead", () => {
    expect(canManageShiftRoster({ id: "vol-1", role: "VOLUNTEER" }, { assignedLeadId: "vol-2" })).toBe(false)
    expect(canManageShiftRoster({ id: "vol-1", role: "VOLUNTEER" }, null)).toBe(false)
  })
})

describe("assignShiftLead", () => {
  it("is Admin-or-Shift-Lead — a plain Volunteer is rejected and nothing is written", async () => {
    const lead = await createVolunteer({ clerkId: "clerk_asl_target", role: "VOLUNTEER" })
    await createVolunteer({ clerkId: "clerk_asl_vol", role: "VOLUNTEER" })
    mockSignedInAs("clerk_asl_vol")

    await expect(assignShiftLead(REFERENCE_DATE_STRING, "AM", formData({ assignedLeadId: lead.id }))).rejects.toThrow("Not authorized")
    const shift = await prisma.shift.findUnique({ where: { date_type: { date: REFERENCE_DATE, type: "AM" } } })
    expect(shift).toBeNull()
  })

  it("lets a Shift Lead name a plain Volunteer as the occurrence-scoped lead", async () => {
    const namedLead = await createVolunteer({ clerkId: "clerk_asl_target2", role: "VOLUNTEER" })
    await createVolunteer({ clerkId: "clerk_asl_lead", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_asl_lead")

    const url = await captureRedirect(() => assignShiftLead(REFERENCE_DATE_STRING, "AM", formData({ assignedLeadId: namedLead.id })))
    expect(url).toBe(`/checkin/roster?date=${REFERENCE_DATE_STRING}&shiftType=AM`)

    const shift = await prisma.shift.findUniqueOrThrow({ where: { date_type: { date: REFERENCE_DATE, type: "AM" } } })
    expect(shift.assignedLeadId).toBe(namedLead.id)
  })

  it("clears assignedLeadId back to null when submitted with an empty selection", async () => {
    await createVolunteer({ clerkId: "clerk_asl_admin", role: "ADMIN" })
    mockSignedInAs("clerk_asl_admin")
    const target = await createVolunteer({ clerkId: "clerk_asl_target3", role: "VOLUNTEER" })
    await assignShiftLead(REFERENCE_DATE_STRING, "AM", formData({ assignedLeadId: target.id })).catch(() => {})

    await captureRedirect(() => assignShiftLead(REFERENCE_DATE_STRING, "AM", formData({ assignedLeadId: "" })))

    const shift = await prisma.shift.findUniqueOrThrow({ where: { date_type: { date: REFERENCE_DATE, type: "AM" } } })
    expect(shift.assignedLeadId).toBeNull()
  })
})

describe("submitRosterAttendance", () => {
  it("rejects a Volunteer who is neither the assigned lead nor globally ADMIN/SHIFT_LEAD", async () => {
    const rostered = await createVolunteer({ name: "Rostered Rae" })
    await createRegularAssignment(rostered.id)
    await createVolunteer({ clerkId: "clerk_sra_vol", role: "VOLUNTEER" })
    mockSignedInAs("clerk_sra_vol")

    await expect(
      submitRosterAttendance(REFERENCE_DATE_STRING, "AM", formData({ presentVolunteerIds: rostered.id }))
    ).rejects.toThrow("Not authorized")
    expect(await prisma.checkIn.count({ where: { volunteerId: rostered.id } })).toBe(0)
  })

  it("lets a plain Volunteer who is this occurrence's assignedLeadId submit attendance", async () => {
    const rostered = await createVolunteer({ name: "Rostered Rae2" })
    await createRegularAssignment(rostered.id)
    const namedLead = await createVolunteer({ clerkId: "clerk_sra_lead", role: "VOLUNTEER" })
    await prisma.shift.create({ data: { date: REFERENCE_DATE, type: "AM", assignedLeadId: namedLead.id } })
    mockSignedInAs("clerk_sra_lead")

    await captureRedirect(() => submitRosterAttendance(REFERENCE_DATE_STRING, "AM", formData({ presentVolunteerIds: rostered.id })))

    const checkIn = await prisma.checkIn.findFirstOrThrow({ where: { volunteerId: rostered.id } })
    expect(checkIn.checkInMethod).toBe("ADMIN_ENTRY")
    expect(checkIn.loggedById).toBe(namedLead.id)
  })

  it("creates a CheckIn only for a volunteer who doesn't already have one — never duplicates or overwrites a real self check-in", async () => {
    const walkOnAlreadyIn = await createVolunteer({ name: "Already In" })
    const rostered = await createVolunteer({ name: "Not Yet In" })
    await createRegularAssignment(rostered.id)
    await createVolunteer({ clerkId: "clerk_sra_admin", role: "ADMIN" })
    mockSignedInAs("clerk_sra_admin")

    const shift = await prisma.shift.upsert({
      where: { date_type: { date: REFERENCE_DATE, type: "AM" } },
      update: {},
      create: { date: REFERENCE_DATE, type: "AM" }
    })
    const workType = await prisma.workType.findFirstOrThrow({ where: { name: "Regular Shift" } })
    const selfCheckIn = await prisma.checkIn.create({
      data: {
        volunteerId: walkOnAlreadyIn.id,
        shiftId: shift.id,
        workTypeId: workType.id,
        checkInAt: new Date(`${REFERENCE_DATE_STRING}T08:47:00`),
        checkInMethod: "QR"
      }
    })

    const fd = new FormData()
    fd.append("presentVolunteerIds", walkOnAlreadyIn.id)
    fd.append("presentVolunteerIds", rostered.id)
    await captureRedirect(() => submitRosterAttendance(REFERENCE_DATE_STRING, "AM", fd))

    const untouched = await prisma.checkIn.findUniqueOrThrow({ where: { id: selfCheckIn.id } })
    expect(untouched.checkInMethod).toBe("QR")
    expect(untouched.checkInAt.toISOString()).toBe(selfCheckIn.checkInAt.toISOString())
    expect(await prisma.checkIn.count({ where: { volunteerId: walkOnAlreadyIn.id } })).toBe(1)

    const newCheckIn = await prisma.checkIn.findFirstOrThrow({ where: { volunteerId: rostered.id } })
    expect(newCheckIn.checkInMethod).toBe("ADMIN_ENTRY")
  })

  it("adding a non-rostered walk-on volunteer to presentVolunteerIds creates their CheckIn too", async () => {
    await createVolunteer({ clerkId: "clerk_sra_admin2", role: "ADMIN" })
    mockSignedInAs("clerk_sra_admin2")
    const walkOn = await createVolunteer({ name: "Fill-in Fred" })

    await captureRedirect(() => submitRosterAttendance(REFERENCE_DATE_STRING, "AM", formData({ presentVolunteerIds: walkOn.id })))

    const checkIn = await prisma.checkIn.findFirstOrThrow({ where: { volunteerId: walkOn.id } })
    expect(checkIn.checkInMethod).toBe("ADMIN_ENTRY")
  })

  it("resolves check-in/out times from ShiftTemplate + FarmSettings.activeSeason when not entered directly", async () => {
    await createVolunteer({ clerkId: "clerk_sra_admin3", role: "ADMIN" })
    mockSignedInAs("clerk_sra_admin3")
    const volunteer = await createVolunteer({ name: "Time Default Tia" })

    const fd = formData({ presentVolunteerIds: volunteer.id })
    // No checkInTime/checkOutTime entered — leave the leader-entered fields blank so the
    // resolved ShiftTemplate/FarmSettings default is what actually gets used.
    await captureRedirect(() => submitRosterAttendance(REFERENCE_DATE_STRING, "AM", fd))

    const checkIn = await prisma.checkIn.findFirstOrThrow({ where: { volunteerId: volunteer.id } })
    // Seeded STANDARD AM window (prisma/seed.ts): 09:00-11:00. Compared as full Date
    // equality (not a UTC ISO-string slice) since `new Date("...T09:00:00")` parses in the
    // local timezone, same as the app's own construction — matches the existing convention
    // in tests/vitest/actions/checkin.test.ts.
    expect(checkIn.checkInAt.getTime()).toBe(new Date(`${REFERENCE_DATE_STRING}T09:00:00`).getTime())
    expect(checkIn.checkOutAt?.getTime()).toBe(new Date(`${REFERENCE_DATE_STRING}T11:00:00`).getTime())
  })

  it("a Shift-level actualStartTime/actualEndTime override wins over the template's seasonal default", async () => {
    await createVolunteer({ clerkId: "clerk_sra_admin4", role: "ADMIN" })
    mockSignedInAs("clerk_sra_admin4")
    const volunteer = await createVolunteer({ name: "Override Olive" })

    await prisma.shift.create({
      data: { date: REFERENCE_DATE, type: "AM", actualStartTime: "09:20", actualEndTime: "11:20" }
    })

    await captureRedirect(() => submitRosterAttendance(REFERENCE_DATE_STRING, "AM", formData({ presentVolunteerIds: volunteer.id })))

    const checkIn = await prisma.checkIn.findFirstOrThrow({ where: { volunteerId: volunteer.id } })
    expect(checkIn.checkInAt.getTime()).toBe(new Date(`${REFERENCE_DATE_STRING}T09:20:00`).getTime())
    expect(checkIn.checkOutAt?.getTime()).toBe(new Date(`${REFERENCE_DATE_STRING}T11:20:00`).getTime())
  })

  it("a leader-entered time directly overrides the resolved default", async () => {
    await createVolunteer({ clerkId: "clerk_sra_admin5", role: "ADMIN" })
    mockSignedInAs("clerk_sra_admin5")
    const volunteer = await createVolunteer({ name: "Manual Mia" })

    await captureRedirect(() =>
      submitRosterAttendance(
        REFERENCE_DATE_STRING,
        "AM",
        formData({ presentVolunteerIds: volunteer.id, checkInTime: "08:15", checkOutTime: "10:15" })
      )
    )

    const checkIn = await prisma.checkIn.findFirstOrThrow({ where: { volunteerId: volunteer.id } })
    expect(checkIn.checkInAt.getTime()).toBe(new Date(`${REFERENCE_DATE_STRING}T08:15:00`).getTime())
    expect(checkIn.checkOutAt?.getTime()).toBe(new Date(`${REFERENCE_DATE_STRING}T10:15:00`).getTime())
  })
})

describe("updateOwnCheckIn", () => {
  it("lets a volunteer correct their own CheckIn's times", async () => {
    const volunteer = await createVolunteer({ clerkId: "clerk_uoc_self", name: "Self Editor" })
    const workType = await prisma.workType.findFirstOrThrow({ where: { name: "Regular Shift" } })
    const shift = await prisma.shift.create({ data: { date: REFERENCE_DATE, type: "AM" } })
    const checkIn = await prisma.checkIn.create({
      data: {
        volunteerId: volunteer.id,
        shiftId: shift.id,
        workTypeId: workType.id,
        checkInAt: new Date(`${REFERENCE_DATE_STRING}T09:00:00`),
        checkOutAt: new Date(`${REFERENCE_DATE_STRING}T11:00:00`),
        checkInMethod: "ADMIN_ENTRY"
      }
    })
    mockSignedInAs("clerk_uoc_self")

    await captureRedirect(() => updateOwnCheckIn(checkIn.id, formData({ checkInTime: "09:10", checkOutTime: "11:10", notes: "actually arrived a bit late" })))

    const updated = await prisma.checkIn.findUniqueOrThrow({ where: { id: checkIn.id } })
    expect(updated.checkInAt.getTime()).toBe(new Date(`${REFERENCE_DATE_STRING}T09:10:00`).getTime())
    expect(updated.checkOutAt?.getTime()).toBe(new Date(`${REFERENCE_DATE_STRING}T11:10:00`).getTime())
    expect(updated.notes).toBe("actually arrived a bit late")
  })

  it("rejects editing someone else's CheckIn row", async () => {
    const owner = await createVolunteer({ name: "Owner Olga" })
    const workType = await prisma.workType.findFirstOrThrow({ where: { name: "Regular Shift" } })
    const shift = await prisma.shift.create({ data: { date: REFERENCE_DATE, type: "AM" } })
    const checkIn = await prisma.checkIn.create({
      data: {
        volunteerId: owner.id,
        shiftId: shift.id,
        workTypeId: workType.id,
        checkInAt: new Date(`${REFERENCE_DATE_STRING}T09:00:00`),
        checkOutAt: new Date(`${REFERENCE_DATE_STRING}T11:00:00`),
        checkInMethod: "ADMIN_ENTRY"
      }
    })
    await createVolunteer({ clerkId: "clerk_uoc_other", role: "VOLUNTEER" })
    mockSignedInAs("clerk_uoc_other")

    await expect(updateOwnCheckIn(checkIn.id, formData({ checkInTime: "10:00", checkOutTime: "12:00" }))).rejects.toThrow("Not authorized")
    const untouched = await prisma.checkIn.findUniqueOrThrow({ where: { id: checkIn.id } })
    expect(untouched.checkInAt.getTime()).toBe(new Date(`${REFERENCE_DATE_STRING}T09:00:00`).getTime())
  })
})
