import { randomUUID } from "node:crypto"
import { test, expect } from "./fixtures"
import { prisma } from "./helpers/db"

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000)
const unique = () => randomUUID().slice(0, 8)

// Volunteer is preserved across E2E tests (tests/e2e/helpers/db.ts), so throwaway volunteers
// created here need unique names/clerkIds to stay isolated across the run.
async function createThrowawayVolunteer(overrides: Partial<{ firstShiftDate: Date; blueReleasedAt: Date }> = {}) {
  return prisma.volunteer.create({
    data: { name: `Throwaway ${unique()}`, role: "VOLUNTEER", status: "ACTIVE", tier: "GREEN", ...overrides }
  })
}

test("an Admin creates a new volunteer tag", async ({ adminPage }) => {
  const name = `Test Tag ${unique()}`

  await adminPage.goto("/tags")
  await adminPage.getByPlaceholder("name").fill(name)
  await adminPage.getByPlaceholder("days since Blue release (optional)").fill("120")
  await adminPage.getByRole("button", { name: "Add tag" }).click()

  await expect(adminPage.getByRole("cell", { name, exact: true })).toBeVisible()
  const tag = await prisma.volunteerTag.findFirstOrThrow({ where: { name } })
  expect(tag.minDaysSinceBlueRelease).toBe(120)
})

test("a Shift Lead sees the tag list read-only — no Add tag form", async ({ shiftLeadPage }) => {
  await shiftLeadPage.goto("/tags")

  await expect(shiftLeadPage.getByRole("button", { name: "Add tag" })).not.toBeVisible()
  await expect(shiftLeadPage.getByRole("cell", { name: "Go Team", exact: true })).toBeVisible()
})

test("a Shift Lead assigns and then removes Go Team on a volunteer's page", async ({ shiftLeadPage }) => {
  const target = await createThrowawayVolunteer()

  await shiftLeadPage.goto(`/volunteers/${target.id}`)
  await expect(shiftLeadPage.getByText("No tags assigned.")).toBeVisible()
  await shiftLeadPage.getByRole("combobox").selectOption({ label: "Go Team" })
  await shiftLeadPage.getByRole("button", { name: "Assign tag" }).click()

  const tagRow = shiftLeadPage.locator("li", { hasText: "Go Team" })
  await expect(tagRow).toBeVisible()
  const assignment = await prisma.volunteerTagAssignment.findFirstOrThrow({ where: { volunteerId: target.id } })
  expect(assignment.assignedById).not.toBeNull()

  await tagRow.getByRole("button", { name: "Remove" }).click()

  await expect(shiftLeadPage.getByText("No tags assigned.")).toBeVisible()
  const removed = await prisma.volunteerTagAssignment.findUniqueOrThrow({ where: { id: assignment.id } })
  expect(removed.removedAt).not.toBeNull()
})

test("a plain Volunteer cannot see assign/remove tag controls on someone else's page", async ({ volunteerPage }) => {
  const target = await createThrowawayVolunteer()

  await volunteerPage.goto(`/volunteers/${target.id}`)

  await expect(volunteerPage.getByRole("button", { name: "Assign tag" })).not.toBeVisible()
})

test("Go Team eligibility candidates report lists a qualifying Blue-released volunteer, and excludes them once tagged", async ({ adminPage }) => {
  const goTeam = await prisma.volunteerTag.findFirstOrThrow({ where: { name: "Go Team" } })
  const target = await createThrowawayVolunteer({
    firstShiftDate: daysAgo(1000),
    blueReleasedAt: daysAgo(goTeam.minDaysSinceBlueRelease! + 30)
  })
  // Scoped to the Go Team candidates section specifically — other lingering test tags in this
  // long-lived local test DB (tests/vitest/actions/tag.test.ts, tests/vitest/lib/tags.test.ts,
  // and earlier E2E runs of this same file) also configure a minDaysSinceBlueRelease and would
  // otherwise list this same throwaway volunteer under their own headings, making an unscoped
  // getByRole("link", { name: target.name }) ambiguous.
  const goTeamSection = () => adminPage.locator("div").filter({ has: adminPage.getByRole("heading", { name: "Go Team", exact: true }) })

  await adminPage.goto("/tags")
  await expect(goTeamSection().getByRole("link", { name: target.name })).toBeVisible()

  await adminPage.goto(`/volunteers/${target.id}`)
  await adminPage.getByRole("combobox").selectOption({ label: "Go Team" })
  await adminPage.getByRole("button", { name: "Assign tag" }).click()

  await adminPage.goto("/tags")
  await expect(goTeamSection().getByRole("link", { name: target.name })).not.toBeVisible()
})
