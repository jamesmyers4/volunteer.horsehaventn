import { randomUUID } from "node:crypto"
import { test, expect } from "./fixtures"
import { prisma } from "./helpers/db"

const unique = () => randomUUID().slice(0, 8)

// Volunteer is preserved across E2E tests, so a throwaway volunteer needs a unique
// name/clerkId to stay isolated — same pattern as volunteer-tags.spec.ts.
async function createThrowawayVolunteer() {
  return prisma.volunteer.create({
    data: { name: `Throwaway ${unique()}`, role: "VOLUNTEER", status: "ACTIVE", tier: "GREEN" }
  })
}

// ShiftTemplate/FarmSettings are lookup/config rows (tests/e2e/helpers/db.ts), never
// truncated between tests — every test here that edits one restores it before finishing,
// same discipline already established for TierThreshold/Location/VolunteerTag.
async function restoreDefaults() {
  const settings = await prisma.farmSettings.findFirst()
  if (settings) await prisma.farmSettings.update({ where: { id: settings.id }, data: { activeSeason: "STANDARD" } })

  const amTemplate = await prisma.shiftTemplate.findUnique({ where: { shiftType: "AM" } })
  if (amTemplate) {
    await prisma.shiftTemplate.update({
      where: { id: amTemplate.id },
      data: { standardStartTime: "09:00", standardEndTime: "11:00", winterStartTime: "10:00", winterEndTime: "12:00" }
    })
  }
}

test.afterEach(async () => {
  await restoreDefaults()
})

test("an Admin edits the AM shift template's standard and winter times on /settings", async ({ adminPage }) => {
  await adminPage.goto("/settings")
  await expect(adminPage.getByRole("heading", { name: "Farm Settings" })).toBeVisible()

  const row = adminPage.locator("tr", { hasText: "AM Shift" })
  await row.locator('input[name="standardStartTime"]').fill("08:45")
  await row.locator('input[name="standardEndTime"]').fill("10:45")
  await row.getByRole("button", { name: "Save" }).click()

  const updatedRow = adminPage.locator("tr", { hasText: "AM Shift" })
  await expect(updatedRow).toContainText("08:45")
  const template = await prisma.shiftTemplate.findUniqueOrThrow({ where: { shiftType: "AM" } })
  expect(template.standardStartTime).toBe("08:45")
})

test("a Shift Lead sees the settings page read-only — no Save buttons", async ({ shiftLeadPage }) => {
  await shiftLeadPage.goto("/settings")

  await expect(shiftLeadPage.getByRole("button", { name: "Save" })).not.toBeVisible()
  await expect(shiftLeadPage.getByText("AM Shift")).toBeVisible()
})

test("flipping the active season to WINTER changes the resolved shift times shown on /checkin", async ({ adminPage }) => {
  await adminPage.goto("/checkin?shiftType=AM")
  await expect(adminPage.getByLabel("Time in")).toHaveValue("09:00")

  await adminPage.goto("/settings")
  // Scoped to the active-season form specifically — the shift-template edit rows below it
  // also have their own "Save" buttons, making an unscoped getByRole ambiguous.
  const seasonForm = adminPage.locator("form", { has: adminPage.getByRole("combobox") })
  await seasonForm.getByRole("combobox").selectOption("WINTER")
  await seasonForm.getByRole("button", { name: "Save" }).click()

  await adminPage.goto("/checkin?shiftType=AM")
  await expect(adminPage.getByLabel("Time in")).toHaveValue("10:00")
  await expect(adminPage.getByLabel("Time out")).toHaveValue("12:00")
})

test("a Shift Lead sets today's actual shift time override, and an Admin can overwrite it", async ({ shiftLeadPage, openAs }) => {
  await shiftLeadPage.goto("/checkin")
  const amOverrideRow = shiftLeadPage.locator("tr", { hasText: "AM" }).first()
  await amOverrideRow.locator('input[name="actualStartTime"]').fill("09:20")
  await amOverrideRow.locator('input[name="actualEndTime"]').fill("11:20")
  await amOverrideRow.getByRole("button", { name: "Save" }).click()

  await expect(shiftLeadPage.locator("tr", { hasText: "AM" }).first()).toContainText("09:20")

  const adminPage = await openAs("admin")
  await adminPage.goto("/checkin")
  const adminAmRow = adminPage.locator("tr", { hasText: "AM" }).first()
  await adminAmRow.locator('input[name="actualStartTime"]').fill("09:00")
  await adminAmRow.locator('input[name="actualEndTime"]').fill("11:00")
  await adminAmRow.getByRole("button", { name: "Save" }).click()

  await expect(adminPage.locator("tr", { hasText: "AM" }).first()).toContainText("09:00 – 11:00")
})

test("a plain Volunteer sees today's shift times read-only — no override form", async ({ volunteerPage }) => {
  await volunteerPage.goto("/checkin")

  await expect(volunteerPage.getByText("Today's shift times")).toBeVisible()
  await expect(volunteerPage.locator('input[name="actualStartTime"]')).not.toBeVisible()
})

test("the kiosk flow checks a volunteer in and then out, with no login on the device itself", async ({ page }) => {
  const volunteer = await createThrowawayVolunteer()

  // No signIn() call here at all — this is the unauthenticated shared-tablet path.
  await page.goto("/kiosk")
  await page.getByPlaceholder("Check-in code").fill(volunteer.checkInCode)
  await page.getByRole("button", { name: "Check In / Out" }).click()

  await expect(page.getByText(`Welcome, ${volunteer.name}!`)).toBeVisible()
  const checkIn = await prisma.checkIn.findFirstOrThrow({ where: { volunteerId: volunteer.id } })
  expect(checkIn.checkInMethod).toBe("KIOSK")
  expect(checkIn.checkOutAt).toBeNull()

  await page.goto("/kiosk")
  await page.getByPlaceholder("Check-in code").fill(volunteer.checkInCode)
  await page.getByRole("button", { name: "Check In / Out" }).click()

  await expect(page.getByText(`See you next time, ${volunteer.name}!`)).toBeVisible()
  const updated = await prisma.checkIn.findUniqueOrThrow({ where: { id: checkIn.id } })
  expect(updated.checkOutAt).not.toBeNull()
  expect(updated.checkOutMethod).toBe("KIOSK")
})

test("the kiosk shows a friendly error for an unrecognized code", async ({ page }) => {
  await page.goto("/kiosk")
  await page.getByPlaceholder("Check-in code").fill("not-a-real-code")
  await page.getByRole("button", { name: "Check In / Out" }).click()

  await expect(page.getByText("Code not recognized")).toBeVisible()
})

test("a volunteer's own QR page links to the kiosk pre-filled with their code, completing the same real-time toggle", async ({
  volunteerPage
}) => {
  await volunteerPage.goto("/checkin/code")
  const code = await volunteerPage.getByText(/^[a-z0-9]{10,}$/).textContent()
  expect(code).toBeTruthy()

  // Same underlying value as the kiosk badge (V2.md's "one code, two presentations") — the
  // real difference is a phone camera scanning the QR image instead of typing the code, not
  // anything about this page's own auth state, so reusing this already-open tab still
  // exercises the actual link/pre-fill/toggle path end to end.
  await volunteerPage.goto(`/kiosk?code=${code}`)
  await expect(volunteerPage.getByPlaceholder("Check-in code")).toHaveValue(code!)
  await volunteerPage.getByRole("button", { name: "Check In / Out" }).click()

  await expect(volunteerPage.getByText("Welcome,")).toBeVisible()
})

test("regression: the existing retrospective web-form check-in flow still works unchanged", async ({ volunteerPage }) => {
  await volunteerPage.goto("/checkin")
  await expect(volunteerPage.getByRole("heading", { name: /Check In/ })).toBeVisible()

  await volunteerPage.getByLabel("Date").fill("2026-07-20")
  await volunteerPage.getByLabel("PM", { exact: true }).check()
  await volunteerPage.getByLabel("Type of work").selectOption({ label: "Barn Cleanup" })
  await volunteerPage.getByLabel("Time in").fill("16:00")
  await volunteerPage.getByLabel("Time out").fill("19:00")
  await volunteerPage.getByRole("button", { name: "Log shift" }).click()

  await expect(volunteerPage.getByText("Shift logged.")).toBeVisible()
})
