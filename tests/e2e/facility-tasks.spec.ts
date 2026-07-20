import { test, expect } from "./fixtures"
import { prisma } from "./helpers/db"

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
// Matches the app's own UTC-date-string convention (src/lib/facilityTasks.ts) so "today" here
// always lines up with what /facility-tasks itself considers today, regardless of run date.
const todayDayName = DAY_NAMES[new Date(new Date().toISOString().slice(0, 10)).getUTCDay()]

test("an Admin schedules a recurring Trough Clean template for today/AM, and a Shift Lead checks it off from the derived list", async ({
  adminPage,
  openAs
}) => {
  // A single Page only ever holds one Clerk session (fixtures.ts) — this test needs an Admin
  // and a Shift Lead active at once, so the second actor comes from openAs, not the shiftLeadPage
  // fixture (which would try to sign in a second time on the same underlying page as adminPage).
  const shiftLeadPage = await openAs("shiftLead")

  await adminPage.goto("/facility-tasks")
  const createForm = adminPage.locator("form").filter({ has: adminPage.getByRole("button", { name: "Add template" }) })
  await createForm.locator("select[name=taskTypeId]").selectOption({ label: "Trough Clean" })
  await createForm.locator("select[name=targetLocationId]").selectOption({ label: "L1 (FIELD)" })
  await createForm.locator("select[name=dayOfWeek]").selectOption({ label: todayDayName })
  await createForm.locator("select[name=shiftType]").selectOption("AM")
  // A plain <form action={...}> submit is a real full-page navigation (server action +
  // redirect, no client JS) — wait for it explicitly rather than trusting click() to have
  // resolved only once it's done (see admin.spec.ts's own location-Save test for the same
  // documented race).
  await Promise.all([adminPage.waitForNavigation(), createForm.getByRole("button", { name: "Add template" }).click()])

  // Both the "Today" expected-list table and the "Recurring task templates" table can show a
  // "Trough Clean" / "L1" row at once (the template we just scheduled matches today), so scope
  // each lookup to its own section rather than matching any <tr> on the page.
  const templatesSection = adminPage.locator("section").filter({ has: adminPage.getByRole("heading", { name: "Recurring task templates" }) })
  const templateRow = templatesSection.locator("tr", { hasText: "Trough Clean" }).filter({ hasText: "L1" })
  await expect(templateRow).toBeVisible()

  await shiftLeadPage.goto("/facility-tasks?shiftType=AM")
  const todaySection = shiftLeadPage.locator("section").filter({ has: shiftLeadPage.getByRole("heading", { name: /^Today/ }) })
  const expectedRow = todaySection.locator("tr", { hasText: "Trough Clean" }).filter({ hasText: "L1" })
  await expect(expectedRow.getByRole("button", { name: "Mark complete" })).toBeVisible()
  await Promise.all([shiftLeadPage.waitForNavigation(), expectedRow.getByRole("button", { name: "Mark complete" }).click()])

  await expect(todaySection.locator("tr", { hasText: "Trough Clean" }).filter({ hasText: "L1" }).getByText("Done")).toBeVisible()

  const completion = await prisma.facilityTaskCompletion.findFirstOrThrow({ where: { shiftType: "AM" }, orderBy: { createdAt: "desc" } })
  const shiftLead = await prisma.volunteer.findFirstOrThrow({ where: { role: "SHIFT_LEAD" } })
  expect(completion.completedById).toBe(shiftLead.id)
  expect(completion.templateId).not.toBeNull()
})

test("recurring template management is Admin-or-Shift-Lead only — a plain Volunteer sees no 'Add template' form", async ({ volunteerPage }) => {
  await volunteerPage.goto("/facility-tasks")
  await expect(volunteerPage.getByRole("button", { name: "Add template" })).not.toBeVisible()
  // The quick-add ad hoc path stays available to any signed-in volunteer regardless.
  await expect(volunteerPage.getByRole("button", { name: "Log completion" })).toBeVisible()
})

test("a Volunteer logs an ad hoc quick-add completion outside the recurring pattern", async ({ volunteerPage }) => {
  await volunteerPage.goto("/facility-tasks")
  const quickAddForm = volunteerPage.locator("form").filter({ has: volunteerPage.getByRole("button", { name: "Log completion" }) })
  await quickAddForm.locator("select[name=taskTypeId]").selectOption({ label: "Trough Clean" })
  await quickAddForm.locator("select[name=targetLocationId]").selectOption({ label: "L2 (FIELD)" })
  await quickAddForm.locator("input[name=notes]").fill("Extra clean after storm runoff")
  await Promise.all([volunteerPage.waitForNavigation(), quickAddForm.getByRole("button", { name: "Log completion" }).click()])

  const volunteer = await prisma.volunteer.findFirstOrThrow({ where: { role: "VOLUNTEER" } })
  const completion = await prisma.facilityTaskCompletion.findFirstOrThrow({ where: { notes: "Extra clean after storm runoff" } })
  expect(completion.templateId).toBeNull()
  expect(completion.completedById).toBe(volunteer.id)
})

test("an Admin toggles requiresStripClean on a barn stall from the Admin Console locations screen", async ({ adminPage }) => {
  // Location is a lookup table never truncated between E2E runs (tests/e2e/helpers/db.ts), so
  // this needs a run-unique name — same reasoning locations.spec.ts follows for its own rows.
  const name = `Test Strip Stall E2E ${Math.random().toString(36).slice(2, 8)}`
  const stall = await prisma.location.create({
    data: { type: "BARN_STALL", name, barnNumber: 9, stallNumber: 91, requiresStripClean: false }
  })

  await adminPage.goto("/admin/locations")
  const row = adminPage.locator("tr", { hasText: name })
  await row.getByLabel("strip clean").check()
  await Promise.all([adminPage.waitForNavigation(), row.getByRole("button", { name: "Save" }).click()])

  const updated = await prisma.location.findUniqueOrThrow({ where: { id: stall.id } })
  expect(updated.requiresStripClean).toBe(true)
})
