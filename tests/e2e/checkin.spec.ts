import { test, expect } from "./fixtures"
import { prisma } from "./helpers/db"
import { TEST_USERS } from "./test-users"

test("a volunteer logs a shift and sees the confirmation", async ({ volunteerPage }) => {
  await volunteerPage.goto("/checkin")
  await expect(volunteerPage.getByRole("heading", { name: /Check In/ })).toBeVisible()

  await volunteerPage.getByLabel("Date").fill("2026-07-16")
  await volunteerPage.getByLabel("AM", { exact: true }).check()
  await volunteerPage.getByLabel("Type of work").selectOption({ label: "Barn Cleanup" })
  await volunteerPage.getByLabel("Time in").fill("08:00")
  await volunteerPage.getByLabel("Time out").fill("12:00")
  await volunteerPage.getByLabel("Notes").fill("Stripped three stalls")
  await volunteerPage.getByRole("button", { name: "Log shift" }).click()

  await expect(volunteerPage.getByText("Shift logged.")).toBeVisible()

  const volunteer = await prisma.volunteer.findFirstOrThrow({ where: { email: TEST_USERS.volunteer.email } })
  const checkIn = await prisma.checkIn.findFirstOrThrow({ where: { volunteerId: volunteer.id } })
  expect(checkIn.notes).toBe("Stripped three stalls")
  expect(checkIn.checkInMethod).toBe("WEB_FORM")
})

test("a Shift Lead can also check in — CheckIn write access isn't Admin-restricted", async ({ shiftLeadPage }) => {
  await shiftLeadPage.goto("/checkin")
  await shiftLeadPage.getByLabel("Date").fill("2026-07-16")
  await shiftLeadPage.getByLabel("PM", { exact: true }).check()
  await shiftLeadPage.getByLabel("Type of work").selectOption({ label: "Regular Shift" })
  await shiftLeadPage.getByLabel("Time in").fill("13:00")
  await shiftLeadPage.getByLabel("Time out").fill("17:00")
  await shiftLeadPage.getByRole("button", { name: "Log shift" }).click()

  await expect(shiftLeadPage.getByText("Shift logged.")).toBeVisible()
})
