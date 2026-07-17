import { describe, it, expect } from "vitest"
import { submitCheckIn } from "@/app/checkin/actions"
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
})
