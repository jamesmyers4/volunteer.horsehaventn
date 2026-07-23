import { randomUUID } from "node:crypto"
import { test, expect } from "./fixtures"
import { prisma } from "./helpers/db"
import { TEST_USERS } from "./test-users"

const unique = () => randomUUID().slice(0, 8)

// Matches the app's own UTC-date-string convention (src/lib/facilityTasks.ts's startOfDay,
// src/lib/shiftRoster.ts) so "today" here always lines up with what /checkin/roster itself
// considers today's occurrence, regardless of run date.
const todayString = new Date().toISOString().slice(0, 10)
const today = new Date(todayString)
const todayDayOfWeek = today.getUTCDay()

async function createThrowawayVolunteer(name: string) {
  return prisma.volunteer.create({
    data: { name: `${name} ${unique()}`, role: "VOLUNTEER", status: "ACTIVE", tier: "GREEN" }
  })
}

test("default roster derives from RegularShiftAssignment; bulk submit creates CheckIns only for those without one yet, leaving a real self check-in untouched", async ({
  adminPage
}) => {
  const rostered = await createThrowawayVolunteer("Rostered")
  await prisma.regularShiftAssignment.create({
    data: { volunteerId: rostered.id, dayOfWeek: todayDayOfWeek, shiftType: "AM", active: true, startDate: new Date("2026-01-01") }
  })

  // A walk-on who already self-checked-in via the kiosk for today's AM shift — the bulk
  // action must never touch this row (V3.md's own test-coverage requirement). Inserted
  // directly rather than driven through the real /kiosk UI: the kiosk's real-time toggle
  // picks AM vs PM from the actual wall-clock hour (src/lib/shifts.ts's
  // determineShiftTypeForNow), which only lands on AM when the suite happens to run before
  // roughly 1:30pm local time — outside that window this test failed deterministically, not
  // flakily. Scoping to today's AM shift directly makes the test time-of-day-independent.
  const walkOn = await createThrowawayVolunteer("WalkOn")
  const workType = await prisma.workType.findFirstOrThrow({ where: { name: "Regular Shift" } })
  const amShift = await prisma.shift.upsert({
    where: { date_type: { date: today, type: "AM" } },
    update: {},
    create: { date: today, type: "AM" }
  })
  const originalCheckIn = await prisma.checkIn.create({
    data: { volunteerId: walkOn.id, shiftId: amShift.id, workTypeId: workType.id, checkInAt: new Date(), checkInMethod: "KIOSK" }
  })

  await adminPage.goto("/checkin/roster?shiftType=AM")
  await expect(adminPage.getByRole("heading", { name: /Shift Roster/ })).toBeVisible()

  const rosteredRow = adminPage.locator("tr", { hasText: rostered.name })
  await expect(rosteredRow.locator('input[type="checkbox"]')).toBeChecked()

  const walkOnRow = adminPage.locator("tr", { hasText: walkOn.name })
  await expect(walkOnRow).toContainText("Already checked in (KIOSK)")
  await expect(walkOnRow.locator('input[type="checkbox"]')).toHaveCount(0)

  await Promise.all([adminPage.waitForNavigation(), adminPage.getByRole("button", { name: "Submit attendance" }).click()])
  await expect(adminPage.getByText("Attendance recorded.")).toBeVisible()

  const rosteredCheckIn = await prisma.checkIn.findFirstOrThrow({ where: { volunteerId: rostered.id } })
  expect(rosteredCheckIn.checkInMethod).toBe("ADMIN_ENTRY")
  const admin = await prisma.volunteer.findFirstOrThrow({ where: { email: TEST_USERS.admin.email } })
  expect(rosteredCheckIn.loggedById).toBe(admin.id)

  // The walk-on's real self check-in is completely untouched: still exactly one row, same method/time.
  expect(await prisma.checkIn.count({ where: { volunteerId: walkOn.id } })).toBe(1)
  const untouched = await prisma.checkIn.findUniqueOrThrow({ where: { id: originalCheckIn.id } })
  expect(untouched.checkInMethod).toBe("KIOSK")
  expect(untouched.checkInAt.getTime()).toBe(originalCheckIn.checkInAt.getTime())
})

test("an Admin adds a non-rostered walk-on to the bulk-submit list via the multi-select", async ({ adminPage }) => {
  const fillIn = await createThrowawayVolunteer("FillIn")

  await adminPage.goto("/checkin/roster?shiftType=AM")
  await adminPage.locator('select[name="presentVolunteerIds"]').selectOption({ label: fillIn.name })
  await Promise.all([adminPage.waitForNavigation(), adminPage.getByRole("button", { name: "Submit attendance" }).click()])

  const checkIn = await prisma.checkIn.findFirstOrThrow({ where: { volunteerId: fillIn.id } })
  expect(checkIn.checkInMethod).toBe("ADMIN_ENTRY")
})

test("roster bulk-submit is gated: a plain Volunteer with no occurrence lead assignment sees a read-only roster, but can submit once named assignedLeadId", async ({
  adminPage,
  openAs
}) => {
  const volunteerPage = await openAs("volunteer")

  await volunteerPage.goto("/checkin/roster?shiftType=AM")
  await expect(volunteerPage.getByRole("button", { name: "Submit attendance" })).not.toBeVisible()
  await expect(volunteerPage.getByText(/roster below is read-only/)).toBeVisible()
  // A plain Volunteer also isn't offered the "set lead" control.
  await expect(volunteerPage.locator('select[name="assignedLeadId"]')).not.toBeVisible()

  await adminPage.goto("/checkin/roster?shiftType=AM")
  const leadSection = adminPage.locator("section").filter({ has: adminPage.getByRole("heading", { name: "Shift lead for this occurrence" }) })
  await leadSection.locator('select[name="assignedLeadId"]').selectOption({ label: TEST_USERS.volunteer.name })
  await Promise.all([adminPage.waitForNavigation(), leadSection.getByRole("button", { name: "Set lead" }).click()])

  const fillIn = await createThrowawayVolunteer("LeadsFillIn")
  await volunteerPage.goto("/checkin/roster?shiftType=AM")
  await expect(volunteerPage.getByRole("button", { name: "Submit attendance" })).toBeVisible()
  await volunteerPage.locator('select[name="presentVolunteerIds"]').selectOption({ label: fillIn.name })
  await Promise.all([volunteerPage.waitForNavigation(), volunteerPage.getByRole("button", { name: "Submit attendance" }).click()])

  const checkIn = await prisma.checkIn.findFirstOrThrow({ where: { volunteerId: fillIn.id } })
  expect(checkIn.checkInMethod).toBe("ADMIN_ENTRY")
  const namedLead = await prisma.volunteer.findFirstOrThrow({ where: { email: TEST_USERS.volunteer.email } })
  expect(checkIn.loggedById).toBe(namedLead.id)
})

test("a volunteer self-edits an ADMIN_ENTRY check-in a shift lead logged on their behalf", async ({ adminPage, openAs }) => {
  // adminPage and a second actor both ultimately depend on Playwright's single per-test
  // `page` fixture (fixtures.ts) — requesting `volunteerPage` alongside `adminPage` in the
  // same test tries to sign in twice on the same underlying page ("already signed in"),
  // a real gotcha already hit and fixed in prior sessions (see HANDOFF.md). openAs gives the
  // second actor an independent browser context instead.
  const volunteerPage = await openAs("volunteer")
  const seededVolunteer = await prisma.volunteer.findFirstOrThrow({ where: { email: TEST_USERS.volunteer.email } })
  await prisma.regularShiftAssignment.create({
    data: { volunteerId: seededVolunteer.id, dayOfWeek: todayDayOfWeek, shiftType: "AM", active: true, startDate: new Date("2026-01-01") }
  })

  await adminPage.goto("/checkin/roster?shiftType=AM")
  await Promise.all([adminPage.waitForNavigation(), adminPage.getByRole("button", { name: "Submit attendance" }).click()])

  await volunteerPage.goto("/checkin")
  const ownRow = volunteerPage.locator("tr", { hasText: "ADMIN_ENTRY" })
  await expect(ownRow).toBeVisible()
  await ownRow.locator('input[name="checkInTime"]').fill("09:07")
  await ownRow.locator('input[name="notes"]').fill("Actually arrived a few minutes late")
  await Promise.all([volunteerPage.waitForNavigation(), ownRow.getByRole("button", { name: "Save" }).click()])

  const updated = await prisma.checkIn.findFirstOrThrow({ where: { volunteerId: seededVolunteer.id } })
  expect(updated.notes).toBe("Actually arrived a few minutes late")
})
