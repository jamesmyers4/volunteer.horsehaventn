import { describe, it, expect } from "vitest"
import { submitCheckIn, setShiftActualTimes, updateOwnCheckIn } from "@/app/checkin/actions"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs, mockSignedOut } from "../helpers/auth-mock"
import { createVolunteer, getWorkType } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

describe("submitCheckIn", () => {
  it("throws when not authenticated and writes nothing", async () => {
    mockSignedOut()
    const workType = await getWorkType()
    await expect(
      submitCheckIn(formData({ date: "2026-07-16", shiftType: "AM", workTypeId: workType.id, checkInTime: "08:00", checkOutTime: "12:00" }))
    ).rejects.toThrow("Not authenticated")
    expect(await prisma.checkIn.count()).toBe(0)
  })

  it("logs a shift for the signed-in volunteer and redirects to the success page", async () => {
    const volunteer = await createVolunteer({ clerkId: "clerk_checkin_1" })
    mockSignedInAs("clerk_checkin_1")
    const workType = await getWorkType()

    const url = await captureRedirect(() =>
      submitCheckIn(
        formData({
          date: "2026-07-16",
          shiftType: "AM",
          workTypeId: workType.id,
          checkInTime: "08:00",
          checkOutTime: "12:00",
          notes: "Cleaned stalls"
        })
      )
    )

    expect(url).toBe("/checkin?success=1")
    const checkIn = await prisma.checkIn.findFirstOrThrow({ where: { volunteerId: volunteer.id } })
    expect(checkIn.checkInMethod).toBe("WEB_FORM")
    expect(checkIn.checkOutMethod).toBe("WEB_FORM")
    expect(checkIn.notes).toBe("Cleaned stalls")
    expect(checkIn.checkInAt.toISOString()).toContain("2026-07-16")
  })

  // V4.md Session 1: KIOSK is a shared, read-only display account for the barn TV terminals —
  // it must never be able to check itself in, even though submitCheckIn used to gate only on
  // requireVolunteer() ("any signed-in person").
  it("rejects a KIOSK-role account and writes nothing", async () => {
    await createVolunteer({ clerkId: "clerk_checkin_kiosk", role: "KIOSK" })
    mockSignedInAs("clerk_checkin_kiosk")
    const workType = await getWorkType()

    await expect(
      submitCheckIn(formData({ date: "2026-07-16", shiftType: "AM", workTypeId: workType.id, checkInTime: "08:00", checkOutTime: "12:00" }))
    ).rejects.toThrow("Not authorized")
    expect(await prisma.checkIn.count()).toBe(0)
  })

  it("omits notes when none were entered", async () => {
    await createVolunteer({ clerkId: "clerk_checkin_2" })
    mockSignedInAs("clerk_checkin_2")
    const workType = await getWorkType()

    await captureRedirect(() =>
      submitCheckIn(formData({ date: "2026-07-16", shiftType: "PM", workTypeId: workType.id, checkInTime: "13:00", checkOutTime: "17:00" }))
    )

    const checkIn = await prisma.checkIn.findFirstOrThrow({ where: {} })
    expect(checkIn.notes).toBeNull()
  })

  it("reuses the same Shift row when two volunteers check in for the same date+type", async () => {
    const volunteerA = await createVolunteer({ clerkId: "clerk_checkin_a" })
    const volunteerB = await createVolunteer({ clerkId: "clerk_checkin_b" })
    const workType = await getWorkType()

    mockSignedInAs("clerk_checkin_a")
    await captureRedirect(() =>
      submitCheckIn(formData({ date: "2026-07-17", shiftType: "AM", workTypeId: workType.id, checkInTime: "08:00", checkOutTime: "12:00" }))
    )

    mockSignedInAs("clerk_checkin_b")
    await captureRedirect(() =>
      submitCheckIn(formData({ date: "2026-07-17", shiftType: "AM", workTypeId: workType.id, checkInTime: "08:15", checkOutTime: "12:15" }))
    )

    const shifts = await prisma.shift.findMany({ where: { date: new Date("2026-07-17"), type: "AM" } })
    expect(shifts).toHaveLength(1)

    const checkInA = await prisma.checkIn.findFirstOrThrow({ where: { volunteerId: volunteerA.id } })
    const checkInB = await prisma.checkIn.findFirstOrThrow({ where: { volunteerId: volunteerB.id } })
    expect(checkInA.shiftId).toBe(checkInB.shiftId)
  })

  it("captures the check-in as a ChangeLog CREATE entry", async () => {
    await createVolunteer({ clerkId: "clerk_checkin_c" })
    mockSignedInAs("clerk_checkin_c")
    const workType = await getWorkType()

    await captureRedirect(() =>
      submitCheckIn(formData({ date: "2026-07-18", shiftType: "AM", workTypeId: workType.id, checkInTime: "08:00", checkOutTime: "12:00" }))
    )

    const checkIn = await prisma.checkIn.findFirstOrThrow({ where: {} })
    const entries = await prisma.changeLog.findMany({ where: { entityType: "CheckIn", entityId: checkIn.id } })
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every((e) => e.action === "CREATE")).toBe(true)
  })

  // V2.md Session 2: the tier progression tenure clock starts at the first recorded
  // shift/check-in, not account creation.
  it("sets firstShiftDate from the first check-in's own date, not account creation", async () => {
    const volunteer = await createVolunteer({ clerkId: "clerk_checkin_fsd1" })
    expect(volunteer.firstShiftDate).toBeNull()
    mockSignedInAs("clerk_checkin_fsd1")
    const workType = await getWorkType()

    await captureRedirect(() =>
      submitCheckIn(formData({ date: "2026-06-01", shiftType: "AM", workTypeId: workType.id, checkInTime: "08:00", checkOutTime: "12:00" }))
    )

    const updated = await prisma.volunteer.findUniqueOrThrow({ where: { id: volunteer.id } })
    expect(updated.firstShiftDate?.toISOString()).toContain("2026-06-01")
  })

  it("never overwrites firstShiftDate on a later check-in", async () => {
    const volunteer = await createVolunteer({ clerkId: "clerk_checkin_fsd2" })
    mockSignedInAs("clerk_checkin_fsd2")
    const workType = await getWorkType()

    await captureRedirect(() =>
      submitCheckIn(formData({ date: "2026-06-01", shiftType: "AM", workTypeId: workType.id, checkInTime: "08:00", checkOutTime: "12:00" }))
    )
    await captureRedirect(() =>
      submitCheckIn(formData({ date: "2026-07-15", shiftType: "PM", workTypeId: workType.id, checkInTime: "13:00", checkOutTime: "17:00" }))
    )

    const updated = await prisma.volunteer.findUniqueOrThrow({ where: { id: volunteer.id } })
    expect(updated.firstShiftDate?.toISOString()).toContain("2026-06-01")
  })

  it("leaves firstShiftDate untouched if it was already set (e.g. by an admin backfill)", async () => {
    const volunteer = await createVolunteer({ clerkId: "clerk_checkin_fsd3" })
    await prisma.volunteer.update({ where: { id: volunteer.id }, data: { firstShiftDate: new Date("2025-01-01") } })
    mockSignedInAs("clerk_checkin_fsd3")
    const workType = await getWorkType()

    await captureRedirect(() =>
      submitCheckIn(formData({ date: "2026-06-01", shiftType: "AM", workTypeId: workType.id, checkInTime: "08:00", checkOutTime: "12:00" }))
    )

    const updated = await prisma.volunteer.findUniqueOrThrow({ where: { id: volunteer.id } })
    expect(updated.firstShiftDate?.toISOString()).toContain("2025-01-01")
  })
})

// V2.md Session 5: per-occurrence correction of a shift's reference time.
describe("setShiftActualTimes", () => {
  it("is Admin-or-Shift-Lead only — a plain Volunteer is rejected and nothing is written", async () => {
    await createVolunteer({ clerkId: "clerk_vol_ssat", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_ssat")

    await expect(
      setShiftActualTimes("2026-07-20", "AM", formData({ actualStartTime: "09:15", actualEndTime: "11:15" }))
    ).rejects.toThrow("Not authorized")
    expect(await prisma.shift.count({ where: { date: new Date("2026-07-20"), type: "AM" } })).toBe(0)
  })

  it("a Shift Lead can set today's actual shift times, creating the Shift row if none exists yet", async () => {
    await createVolunteer({ clerkId: "clerk_lead_ssat", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_ssat")

    const url = await captureRedirect(() =>
      setShiftActualTimes("2026-07-20", "AM", formData({ actualStartTime: "09:15", actualEndTime: "11:15" }))
    )

    expect(url).toBe("/checkin")
    const shift = await prisma.shift.findFirstOrThrow({ where: { date: new Date("2026-07-20"), type: "AM" } })
    expect(shift.actualStartTime).toBe("09:15")
    expect(shift.actualEndTime).toBe("11:15")
  })

  it("an Admin can overwrite a Shift Lead's previously-set override on the same occurrence", async () => {
    await createVolunteer({ clerkId: "clerk_lead_ssat2", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_ssat2")
    await captureRedirect(() => setShiftActualTimes("2026-07-21", "PM", formData({ actualStartTime: "16:10", actualEndTime: "19:10" })))

    await createVolunteer({ clerkId: "clerk_admin_ssat2", role: "ADMIN" })
    mockSignedInAs("clerk_admin_ssat2")
    await captureRedirect(() => setShiftActualTimes("2026-07-21", "PM", formData({ actualStartTime: "16:00", actualEndTime: "19:00" })))

    const shift = await prisma.shift.findFirstOrThrow({ where: { date: new Date("2026-07-21"), type: "PM" } })
    expect(shift.actualStartTime).toBe("16:00")

    const entries = await prisma.changeLog.findMany({ where: { entityType: "Shift", entityId: shift.id }, orderBy: { createdAt: "asc" } })
    expect(entries.length).toBeGreaterThan(0)
  })

  it("reuses the same Shift row a volunteer already checked into for that date+type", async () => {
    const volunteer = await createVolunteer({ clerkId: "clerk_vol_ssat3" })
    mockSignedInAs("clerk_vol_ssat3")
    const workType = await getWorkType()
    await captureRedirect(() =>
      submitCheckIn(formData({ date: "2026-07-22", shiftType: "AM", workTypeId: workType.id, checkInTime: "09:00", checkOutTime: "11:00" }))
    )
    const existingCheckIn = await prisma.checkIn.findFirstOrThrow({ where: { volunteerId: volunteer.id } })

    await createVolunteer({ clerkId: "clerk_admin_ssat3", role: "ADMIN" })
    mockSignedInAs("clerk_admin_ssat3")
    await captureRedirect(() => setShiftActualTimes("2026-07-22", "AM", formData({ actualStartTime: "09:05", actualEndTime: "11:05" })))

    const checkInShift = await prisma.checkIn.findUniqueOrThrow({ where: { id: existingCheckIn.id } })
    const shift = await prisma.shift.findUniqueOrThrow({ where: { id: checkInShift.shiftId } })
    expect(shift.actualStartTime).toBe("09:05")
  })
})

// V3.md Session 4 / V4.md Session 1: a volunteer correcting their own retrospective check-in
// time — self-service, so it used to gate only on requireVolunteer(), the same KIOSK gap
// submitCheckIn had.
describe("updateOwnCheckIn", () => {
  it("rejects a KIOSK-role account, even for a garbage checkInId — the role check runs first", async () => {
    await createVolunteer({ clerkId: "clerk_uoc_kiosk", role: "KIOSK" })
    mockSignedInAs("clerk_uoc_kiosk")

    await expect(updateOwnCheckIn("nonexistent-id", formData({ checkInTime: "08:00", checkOutTime: "12:00" }))).rejects.toThrow(
      "Not authorized"
    )
  })

  it("lets a volunteer correct their own check-in's times", async () => {
    const volunteer = await createVolunteer({ clerkId: "clerk_uoc_vol" })
    mockSignedInAs("clerk_uoc_vol")
    const workType = await getWorkType()
    await captureRedirect(() =>
      submitCheckIn(formData({ date: "2026-07-23", shiftType: "AM", workTypeId: workType.id, checkInTime: "08:00", checkOutTime: "12:00" }))
    )
    const checkIn = await prisma.checkIn.findFirstOrThrow({ where: { volunteerId: volunteer.id } })

    await captureRedirect(() => updateOwnCheckIn(checkIn.id, formData({ checkInTime: "08:15", checkOutTime: "12:15" })))

    const updated = await prisma.checkIn.findUniqueOrThrow({ where: { id: checkIn.id } })
    expect(updated.checkInAt.getTime()).toBe(new Date("2026-07-23T08:15:00").getTime())
  })
})
