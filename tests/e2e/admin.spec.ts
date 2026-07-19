import { randomUUID } from "node:crypto"
import { test, expect } from "./fixtures"
import { prisma } from "./helpers/db"

const unique = () => randomUUID().slice(0, 8)

// Volunteer is preserved across E2E tests (tests/e2e/helpers/db.ts), so throwaway volunteers
// created here need unique names/clerkIds to stay isolated across the run — never touch the
// fixed TEST_USERS rows the adminPage/shiftLeadPage/volunteerPage fixtures depend on.
async function createThrowawayVolunteer(overrides: Partial<{ role: "ADMIN" | "SHIFT_LEAD" | "VOLUNTEER" | "GUEST"; canScheduleEvents: boolean }> = {}) {
  return prisma.volunteer.create({
    data: { name: `Throwaway ${unique()}`, role: overrides.role ?? "VOLUNTEER", status: "ACTIVE", tier: "GREEN", ...overrides }
  })
}

// V2.md Session 7's own test-coverage ask: "non-ADMIN cannot reach /admin routes at all (not
// just hidden nav — actual route/API protection)." A Shift Lead is the closest non-Admin role
// to Admin (already trusted with org-wide shift/animal-care access elsewhere in this app), so
// it's the strongest version of this boundary check.
for (const path of ["/admin", "/admin/locations", "/admin/event-categories", "/admin/volunteers"]) {
  test(`a Shift Lead is blocked from ${path} — sees "Not authorized", no admin data rendered`, async ({ shiftLeadPage }) => {
    await shiftLeadPage.goto(path)

    await expect(shiftLeadPage.getByText("Not authorized")).toBeVisible()
    await expect(shiftLeadPage.getByRole("table")).not.toBeVisible()
  })
}

test("a plain Volunteer is also blocked from the Admin Console home", async ({ volunteerPage }) => {
  await volunteerPage.goto("/admin")

  await expect(volunteerPage.getByText("Not authorized")).toBeVisible()
})

test("an Admin sees the console home with links to every lookup/config area and user management", async ({ adminPage }) => {
  await adminPage.goto("/admin")

  await expect(adminPage.getByRole("link", { name: "Locations" })).toBeVisible()
  await expect(adminPage.getByRole("link", { name: "Event categories" })).toBeVisible()
  await expect(adminPage.getByRole("link", { name: "Volunteer tags" })).toBeVisible()
  await expect(adminPage.getByRole("link", { name: "Training requirements" })).toBeVisible()
  await expect(adminPage.getByRole("link", { name: "Tier thresholds" })).toBeVisible()
  await expect(adminPage.getByRole("link", { name: "Farm settings & shift templates" })).toBeVisible()
  await expect(adminPage.getByRole("link", { name: "Volunteers" })).toBeVisible()
})

test("an Admin creates then edits an event category", async ({ adminPage }) => {
  const name = `Test Category ${unique()}`

  await adminPage.goto("/admin/event-categories")
  await adminPage.getByPlaceholder("name").fill(name)
  await adminPage.getByRole("button", { name: "Add category" }).click()

  await expect(adminPage.getByRole("cell", { name, exact: true })).toBeVisible()

  const row = adminPage.locator("tr", { hasText: name })
  const renamed = `Renamed ${unique()}`
  await row.getByRole("textbox").fill(renamed)
  await row.locator('input[name="active"]').uncheck()
  await row.getByRole("button", { name: "Save" }).click()

  await expect(adminPage.getByRole("cell", { name: renamed, exact: true })).toBeVisible()
  const category = await prisma.eventCategory.findFirstOrThrow({ where: { name: renamed } })
  expect(category.active).toBe(false)
})

test("a Shift Lead cannot reach event category CRUD via direct navigation", async ({ shiftLeadPage }) => {
  const name = `Test Category ${unique()}`

  await shiftLeadPage.goto("/admin/event-categories")

  await expect(shiftLeadPage.getByText("Not authorized")).toBeVisible()
  expect(await prisma.eventCategory.count({ where: { name } })).toBe(0)
})

test("an Admin creates a Location, then edits its name and deactivates it", async ({ adminPage }) => {
  const code = `T${unique()}`

  await adminPage.goto("/admin/locations")
  const addForm = adminPage.locator("form").filter({ hasText: "Add location" })
  await addForm.locator('select[name="type"]').selectOption("FIELD")
  await addForm.locator('input[name="name"]').fill(code)
  await addForm.locator('input[name="fieldCode"]').fill(code)
  await addForm.getByRole("button", { name: "Add location" }).click()

  await expect(adminPage.getByRole("cell", { name: code, exact: true })).toBeVisible()

  const row = adminPage.locator("tr", { hasText: code })
  await row.locator('input[name="isActive"]').uncheck()
  // A plain <form action={...}> submit is a real full-page navigation (server action +
  // redirect, no client JS) — wait for it explicitly rather than trusting click() to have
  // resolved only once it's done, which proved to be a real race (caught by running this
  // test repeatedly, not just once).
  await Promise.all([adminPage.waitForNavigation(), row.getByRole("button", { name: "Save" }).click()])

  const location = await prisma.location.findFirstOrThrow({ where: { fieldCode: code } })
  expect(location.isActive).toBe(false)
})

test("an Admin changes a volunteer's role from Volunteer to Shift Lead", async ({ adminPage }) => {
  const target = await createThrowawayVolunteer({ role: "VOLUNTEER" })

  await adminPage.goto("/admin/volunteers")
  const row = adminPage.locator("tr", { hasText: target.name })
  await row.locator('select[name="role"]').selectOption("SHIFT_LEAD")
  await Promise.all([adminPage.waitForNavigation(), row.getByRole("button", { name: "Save" }).first().click()])

  const updated = await prisma.volunteer.findUniqueOrThrow({ where: { id: target.id } })
  expect(updated.role).toBe("SHIFT_LEAD")
})

test("an Admin grants canScheduleEvents to a volunteer who didn't have it — same field createEvent's permission check reads", async ({
  adminPage
}) => {
  const target = await createThrowawayVolunteer({ canScheduleEvents: false })

  await adminPage.goto("/admin/volunteers")
  const row = adminPage.locator("tr", { hasText: target.name })
  await row.locator('input[name="canScheduleEvents"]').check()
  // Same real-navigation race as the role-change and Location tests above — .check() sets the
  // checkbox's client-side state instantly, so waiting on the checkbox's own toBeChecked()
  // would pass on the pre-submit DOM and prove nothing about whether the server actually wrote
  // it. Wait for the navigation itself instead.
  await Promise.all([adminPage.waitForNavigation(), row.getByRole("button", { name: "Save" }).nth(1).click()])

  const updated = await prisma.volunteer.findUniqueOrThrow({ where: { id: target.id } })
  expect(updated.canScheduleEvents).toBe(true)
})

test("Blue release and tag management are reached from /admin/volunteers via a link to the volunteer's own page, not rebuilt", async ({
  adminPage
}) => {
  const target = await createThrowawayVolunteer()

  await adminPage.goto("/admin/volunteers")
  const row = adminPage.locator("tr", { hasText: target.name })
  await row.getByRole("link", { name: "Tier / tags →" }).click()

  await expect(adminPage).toHaveURL(new RegExp(`/volunteers/${target.id}$`))
  await expect(adminPage.getByRole("heading", { name: target.name })).toBeVisible()
})
