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
for (const path of [
  "/admin",
  "/admin/locations",
  "/admin/event-categories",
  "/admin/volunteers",
  "/admin/facility-task-types",
  "/admin/facility-tasks",
  "/admin/alerts"
]) {
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
  await expect(adminPage.getByRole("link", { name: "Intake groups" })).toBeVisible()
  await expect(adminPage.getByRole("link", { name: "Facility task types" })).toBeVisible()
  await expect(adminPage.getByRole("link", { name: "Recurring facility task calendar" })).toBeVisible()
  await expect(adminPage.getByRole("link", { name: "Pinned alerts" })).toBeVisible()
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

// V3.md Session 7: FacilityTaskType is edit-only (category is @unique against a fixed
// three-value enum, same capped-table shape as ShiftTemplate) — this renames the shared seeded
// "Trough Clean" row and restores it at the end, same discipline tests/vitest's own
// admin-facility-task-types.test.ts follows for the lookup-table-never-truncated-between-tests
// rule (CLAUDE.md).
test("an Admin renames a Facility Task Type and toggles it inactive, then restores it", async ({ adminPage }) => {
  await adminPage.goto("/admin/facility-task-types")
  const row = adminPage.locator("tr", { hasText: "TROUGH_CLEAN" })
  await expect(row.locator('input[name="name"]')).toHaveValue("Trough Clean")

  await row.locator('input[name="name"]').fill("Water Trough Clean")
  await row.locator('input[name="active"]').uncheck()
  await Promise.all([adminPage.waitForNavigation(), row.getByRole("button", { name: "Save" }).click()])

  const renamedRow = adminPage.locator("tr", { hasText: "TROUGH_CLEAN" })
  await expect(renamedRow.locator('input[name="name"]')).toHaveValue("Water Trough Clean")
  await expect(renamedRow.locator('input[name="active"]')).not.toBeChecked()

  await renamedRow.locator('input[name="name"]').fill("Trough Clean")
  await renamedRow.locator('input[name="active"]').check()
  await Promise.all([adminPage.waitForNavigation(), renamedRow.getByRole("button", { name: "Save" }).click()])
})

test("an Admin assigns a new recurring facility task slot from the monthly calendar, and it appears on the correct weekday", async ({
  adminPage
}) => {
  // 2026-07-01 is a Wednesday — deterministic regardless of when this test actually runs,
  // matching facility-tasks.spec.ts's own reliance on a fixed reference date pattern elsewhere.
  await adminPage.goto("/admin/facility-tasks?month=2026-07")
  await expect(adminPage.getByRole("heading", { name: "July 2026" })).toBeVisible()

  const assignForm = adminPage.locator("form").filter({ has: adminPage.getByRole("button", { name: "Assign slot" }) })
  await assignForm.locator("select[name=taskTypeId]").selectOption({ label: "Trough Clean" })
  await assignForm.locator("select[name=targetLocationId]").selectOption({ label: "L3 (FIELD)" })
  await assignForm.locator("select[name=dayOfWeek]").selectOption({ label: "Wednesday" })
  await assignForm.locator("select[name=shiftType]").selectOption("AM")
  await Promise.all([adminPage.waitForNavigation(), assignForm.getByRole("button", { name: "Assign slot" }).click()])

  // The redirectTo hidden field should have landed back on this same admin calendar page
  // (not the plain /facility-tasks list) with the month preserved.
  await expect(adminPage).toHaveURL(/\/admin\/facility-tasks\?month=2026-07/)

  const slotsSection = adminPage.locator("section").filter({ has: adminPage.getByRole("heading", { name: "Recurring task slots" }) })
  await expect(slotsSection.locator("tr", { hasText: "Trough Clean" }).filter({ hasText: "L3" }).filter({ hasText: "Wednesday" })).toBeVisible()

  // The calendar grid itself should show the assigned slot on every Wednesday cell in July.
  await expect(adminPage.getByText(/AM Trough Clean — L3/).first()).toBeVisible()

  const slot = await prisma.recurringTaskTemplate.findFirstOrThrow({ where: { dayOfWeek: 3, shiftType: "AM" }, include: { targetLocation: true } })
  expect(slot.targetLocation.fieldCode).toBe("L3")
})

test("month navigation links move the calendar forward and back a month", async ({ adminPage }) => {
  await adminPage.goto("/admin/facility-tasks?month=2026-07")
  await expect(adminPage.getByRole("heading", { name: "July 2026" })).toBeVisible()

  await adminPage.getByRole("link", { name: "August →" }).click()
  await expect(adminPage).toHaveURL(/month=2026-08/)
  await expect(adminPage.getByRole("heading", { name: "August 2026" })).toBeVisible()

  await adminPage.getByRole("link", { name: "← July" }).click()
  await expect(adminPage).toHaveURL(/month=2026-07/)
  await expect(adminPage.getByRole("heading", { name: "July 2026" })).toBeVisible()
})

test("an Admin composes a pinned alert targeting a specific SHIFT channel, with severity and an expiry", async ({ adminPage }) => {
  await adminPage.goto("/admin/alerts")

  await adminPage.locator("select[name=channelId]").selectOption({ label: "AM Shift Chat" })
  await adminPage.getByPlaceholder("Alert message").fill("Cold snap tonight — check water heaters at AM shift")
  await adminPage.locator("select[name=severity]").selectOption("WARNING")
  await adminPage.locator('input[name="expiresAt"]').fill("2030-01-01T08:00")
  await Promise.all([adminPage.waitForNavigation(), adminPage.getByRole("button", { name: "Post pinned alert" }).click()])

  // postChatMessage redirects to the channel's own /chat view — the message really posted.
  await expect(adminPage.getByText(/Cold snap tonight/)).toBeVisible()

  const channel = await prisma.chatChannel.findFirstOrThrow({ where: { type: "SHIFT", shiftType: "AM" } })
  const message = await prisma.chatMessage.findFirstOrThrow({ where: { channelId: channel.id, body: { contains: "Cold snap tonight" } } })
  expect(message.pinned).toBe(true)
  expect(message.severity).toBe("WARNING")
  expect(message.expiresAt).not.toBeNull()

  await adminPage.goto("/admin/alerts")
  await expect(adminPage.getByText(/Cold snap tonight/)).toBeVisible()
})
