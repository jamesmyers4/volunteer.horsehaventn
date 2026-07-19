import { randomUUID } from "node:crypto"
import { test, expect } from "./fixtures"
import { prisma } from "./helpers/db"

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000)
const unique = () => randomUUID().slice(0, 8)

// Volunteer is preserved across E2E tests (tests/e2e/helpers/db.ts), so throwaway volunteers
// created here need unique names/clerkIds to stay isolated from each other and from the
// shared e2e-admin/e2e-shiftlead/e2e-volunteer test users.
async function createThrowawayVolunteer(overrides: Partial<{ firstShiftDate: Date; blueReleasedAt: Date }> = {}) {
  return prisma.volunteer.create({
    data: { name: `Throwaway ${unique()}`, role: "VOLUNTEER", status: "ACTIVE", tier: "GREEN", ...overrides }
  })
}

test("an Admin releases a tenure-eligible volunteer for Blue", async ({ adminPage }) => {
  const target = await createThrowawayVolunteer({ firstShiftDate: daysAgo(731) })

  await adminPage.goto(`/volunteers/${target.id}`)
  await expect(adminPage.getByText("Actual tier")).toBeVisible()
  await adminPage.getByRole("button", { name: "Release for Blue" }).click()

  await expect(adminPage.getByText("Not yet")).not.toBeVisible()
  const released = await prisma.volunteer.findUniqueOrThrow({ where: { id: target.id } })
  expect(released.blueReleasedAt).not.toBeNull()
  expect(released.blueReleasedById).not.toBeNull()
})

test("Blue release is blocked in the UI before tenure is met", async ({ adminPage }) => {
  const target = await createThrowawayVolunteer({ firstShiftDate: daysAgo(30) })

  await adminPage.goto(`/volunteers/${target.id}`)

  await expect(adminPage.getByRole("button", { name: "Release for Blue" })).toBeDisabled()
  await expect(adminPage.getByText("Blocked — tenure threshold not met yet.")).toBeVisible()
})

test("a plain Volunteer cannot see the Release for Blue button on someone else's page", async ({ volunteerPage }) => {
  const target = await createThrowawayVolunteer({ firstShiftDate: daysAgo(731) })

  await volunteerPage.goto(`/volunteers/${target.id}`)

  await expect(volunteerPage.getByRole("button", { name: "Release for Blue" })).not.toBeVisible()
})

test("a volunteer self-attests to a required training on their own page", async ({ volunteerPage }) => {
  const self = await prisma.volunteer.findFirstOrThrow({ where: { name: "E2E Volunteer" } })

  await volunteerPage.goto(`/volunteers/${self.id}`)
  const row = volunteerPage.locator("tr", { hasText: "Volunteer Manual Acknowledgment" })
  await expect(row.getByText("Missing")).toBeVisible()

  await row.getByRole("button", { name: "I read this" }).click()

  const refreshedRow = volunteerPage.locator("tr", { hasText: "Volunteer Manual Acknowledgment" })
  await expect(refreshedRow.getByText("Current")).toBeVisible()

  const record = await prisma.credentialRecord.findFirstOrThrow({ where: { volunteerId: self.id } })
  expect(record.expiresAt).not.toBeNull()
})

test("a Shift Lead cannot self-attest on someone else's page — no acknowledge form shown", async ({ shiftLeadPage }) => {
  const target = await createThrowawayVolunteer()

  await shiftLeadPage.goto(`/volunteers/${target.id}`)

  await expect(shiftLeadPage.getByRole("button", { name: "I read this" })).not.toBeVisible()
})

test("the training compliance report lists a volunteer missing required training", async ({ shiftLeadPage }) => {
  const target = await createThrowawayVolunteer()

  await shiftLeadPage.goto("/training")

  await expect(shiftLeadPage.getByText(new RegExp(`${target.name} — Volunteer Manual Acknowledgment \\(missing\\)`))).toBeVisible()
})

test("an Admin edits a tier threshold and it persists", async ({ adminPage }) => {
  const original = await prisma.tierThreshold.findFirstOrThrow({ where: { tier: "ORANGE" } })

  try {
    await adminPage.goto("/tiers")
    const row = adminPage.locator("tr", { hasText: "ORANGE" })
    await row.getByRole("spinbutton").fill("200")
    await row.getByRole("button", { name: "Save" }).click()

    const updatedRow = adminPage.locator("tr", { hasText: "ORANGE" })
    await expect(updatedRow.getByText("200")).toBeVisible()
  } finally {
    // TierThreshold is a preserved lookup table across the whole E2E run — restore it so
    // later tests/files aren't affected by this edit.
    await prisma.tierThreshold.update({ where: { id: original.id }, data: { minDaysTenure: original.minDaysTenure } })
  }
})

test("a Shift Lead cannot edit tier thresholds — read-only, no Save form", async ({ shiftLeadPage }) => {
  await shiftLeadPage.goto("/tiers")

  await expect(shiftLeadPage.getByRole("button", { name: "Save" })).not.toBeVisible()
})
