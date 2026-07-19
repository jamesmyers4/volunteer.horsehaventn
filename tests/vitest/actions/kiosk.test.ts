import { describe, it, expect, beforeEach } from "vitest"
import { performKioskToggle } from "@/lib/checkin"
import { kioskToggle } from "@/app/kiosk/actions"
import { prisma } from "@/lib/prisma"
import { createVolunteer, getWorkType } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

// FarmSettings is a lookup/config row (tests/vitest/helpers/db.ts), not truncated between
// tests — force it to STANDARD before each test here so shift-type resolution below is
// deterministic regardless of what an earlier test (or /settings) left it as, matching the
// existing "tests touching shared config need an explicit restore" precedent.
beforeEach(async () => {
  const settings = await prisma.farmSettings.findFirstOrThrow()
  await prisma.farmSettings.update({ where: { id: settings.id }, data: { activeSeason: "STANDARD" } })
})

// Seeded STANDARD windows (prisma/seed.ts): AM 09:00-11:00, PM 16:00-19:00.
const inAmWindow = new Date(2026, 0, 1, 9, 30)
const inPmWindow = new Date(2026, 0, 1, 17, 0)

describe("performKioskToggle", () => {
  it("throws for an unrecognized code and writes nothing", async () => {
    await expect(performKioskToggle("not-a-real-code", inAmWindow)).rejects.toThrow("Code not recognized")
    expect(await prisma.checkIn.count()).toBe(0)
  })

  it("checks in a volunteer with no open session, using KIOSK as the method", async () => {
    const volunteer = await createVolunteer()
    await getWorkType()

    const result = await performKioskToggle(volunteer.checkInCode, inAmWindow)

    expect(result.action).toBe("checked-in")
    expect(result.volunteerName).toBe(volunteer.name)
    const checkIn = await prisma.checkIn.findFirstOrThrow({ where: { volunteerId: volunteer.id } })
    expect(checkIn.checkInMethod).toBe("KIOSK")
    expect(checkIn.checkOutAt).toBeNull()
  })

  it("resolves the shift type from time-of-day — morning scans go to AM", async () => {
    const volunteer = await createVolunteer()
    await getWorkType()

    await performKioskToggle(volunteer.checkInCode, inAmWindow)

    const checkIn = await prisma.checkIn.findFirstOrThrow({ where: { volunteerId: volunteer.id }, include: { shift: true } })
    expect(checkIn.shift.type).toBe("AM")
  })

  it("resolves the shift type from time-of-day — afternoon scans go to PM", async () => {
    const volunteer = await createVolunteer()
    await getWorkType()

    await performKioskToggle(volunteer.checkInCode, inPmWindow)

    const checkIn = await prisma.checkIn.findFirstOrThrow({ where: { volunteerId: volunteer.id }, include: { shift: true } })
    expect(checkIn.shift.type).toBe("PM")
  })

  it("defaults the new CheckIn to the Regular Shift WorkType", async () => {
    const volunteer = await createVolunteer()
    const workType = await getWorkType("Regular Shift")

    await performKioskToggle(volunteer.checkInCode, inAmWindow)

    const checkIn = await prisma.checkIn.findFirstOrThrow({ where: { volunteerId: volunteer.id } })
    expect(checkIn.workTypeId).toBe(workType.id)
  })

  it("closes an open session on the second scan instead of opening a new one — no duplicate open sessions", async () => {
    const volunteer = await createVolunteer()
    await getWorkType()
    await performKioskToggle(volunteer.checkInCode, inAmWindow)

    const result = await performKioskToggle(volunteer.checkInCode, new Date(2026, 0, 1, 11, 5))

    expect(result.action).toBe("checked-out")
    const checkIns = await prisma.checkIn.findMany({ where: { volunteerId: volunteer.id } })
    expect(checkIns).toHaveLength(1)
    expect(checkIns[0].checkOutAt).not.toBeNull()
    expect(checkIns[0].checkOutMethod).toBe("KIOSK")
  })

  it("a third scan reopens a new session after the second scan closed the first", async () => {
    const volunteer = await createVolunteer()
    await getWorkType()
    await performKioskToggle(volunteer.checkInCode, inAmWindow)
    await performKioskToggle(volunteer.checkInCode, new Date(2026, 0, 1, 11, 5))

    const result = await performKioskToggle(volunteer.checkInCode, inPmWindow)

    expect(result.action).toBe("checked-in")
    const openSessions = await prisma.checkIn.findMany({ where: { volunteerId: volunteer.id, checkOutAt: null } })
    expect(openSessions).toHaveLength(1)
  })

  it("closes the most recent open session even if it's from a prior day (a forgotten checkout self-heals)", async () => {
    const volunteer = await createVolunteer()
    const workType = await getWorkType()
    await prisma.checkIn.create({
      data: {
        volunteerId: volunteer.id,
        shiftId: (await prisma.shift.create({ data: { date: new Date("2026-01-01"), type: "AM" } })).id,
        workTypeId: workType.id,
        checkInAt: new Date("2026-01-01T09:00:00"),
        checkInMethod: "KIOSK"
      }
    })

    const result = await performKioskToggle(volunteer.checkInCode, inAmWindow)

    expect(result.action).toBe("checked-out")
    expect(await prisma.checkIn.count({ where: { volunteerId: volunteer.id, checkOutAt: null } })).toBe(0)
  })

  it("sets firstShiftDate on a first kiosk check-in, same as the web form does", async () => {
    const volunteer = await createVolunteer()
    expect(volunteer.firstShiftDate).toBeNull()
    await getWorkType()

    await performKioskToggle(volunteer.checkInCode, inAmWindow)

    const updated = await prisma.volunteer.findUniqueOrThrow({ where: { id: volunteer.id } })
    expect(updated.firstShiftDate).not.toBeNull()
  })

  it("captures the kiosk check-in as a ChangeLog CREATE entry", async () => {
    const volunteer = await createVolunteer()
    await getWorkType()

    await performKioskToggle(volunteer.checkInCode, inAmWindow)

    const checkIn = await prisma.checkIn.findFirstOrThrow({ where: { volunteerId: volunteer.id } })
    const entries = await prisma.changeLog.findMany({ where: { entityType: "CheckIn", entityId: checkIn.id } })
    expect(entries.length).toBeGreaterThan(0)
  })
})

describe("kioskToggle (the Server Action)", () => {
  it("redirects to /kiosk with a friendly error for an unrecognized code, no auth required", async () => {
    const url = await captureRedirect(() => kioskToggle(formData({ code: "not-a-real-code" })))
    expect(url).toBe("/kiosk?error=1")
  })

  it("redirects to /kiosk with the result encoded in the query string on success", async () => {
    const volunteer = await createVolunteer()
    await getWorkType()

    const url = await captureRedirect(() => kioskToggle(formData({ code: volunteer.checkInCode })))

    expect(url).toContain("/kiosk?")
    expect(url).toContain("result=checked-in")
    // URLSearchParams encodes spaces as "+", not "%20" — matches new URLSearchParams(...).toString() in the action itself.
    expect(url).toContain(new URLSearchParams({ name: volunteer.name }).toString())
  })
})
