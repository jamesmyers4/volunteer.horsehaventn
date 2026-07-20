import { randomUUID } from "node:crypto"
import { test, expect } from "./fixtures"
import { prisma } from "./helpers/db"
import { TEST_USERS } from "./test-users"

const unique = () => randomUUID().slice(0, 8)

// Matches the app's own UTC-date-string convention (src/lib/facilityTasks.ts's startOfDay,
// src/lib/shiftRoster.ts), same as shift-roster.spec.ts, so "today" here always lines up with
// what /checkin/shift-report itself considers today's occurrence, regardless of run date.
const todayString = new Date().toISOString().slice(0, 10)

test("Admin manages checklist templates at /checklists; a non-Admin is rejected", async ({ adminPage, openAs }) => {
  await adminPage.goto("/checklists")
  await expect(adminPage.getByRole("heading", { name: "End-of-Shift Checklist Templates" })).toBeVisible()

  const templateName = `E2E Checklist ${unique()}`
  await adminPage.getByPlaceholder("template name").fill(templateName)
  await Promise.all([adminPage.waitForNavigation(), adminPage.getByRole("button", { name: "Add template" }).click()])

  const templateSection = adminPage.locator("section").filter({ has: adminPage.getByRole("heading", { name: templateName }) })
  await templateSection.getByPlaceholder("prompt").fill("Anything unusual to report?")
  await Promise.all([adminPage.waitForNavigation(), templateSection.getByRole("button", { name: "Add item" }).click()])
  await expect(templateSection.getByRole("cell", { name: "Anything unusual to report?", exact: true })).toBeVisible()

  const volunteerPage = await openAs("volunteer")
  await volunteerPage.goto("/checklists")
  await expect(volunteerPage.getByRole("heading", { name: "Not authorized" })).toBeVisible()
})

test("the shift's assigned lead submits an end-of-shift report; a second attempt shows it's already submitted, and a non-lead sees a read-only message", async ({
  adminPage,
  openAs
}) => {
  const volunteerPage = await openAs("volunteer")
  const seededVolunteer = await prisma.volunteer.findFirstOrThrow({ where: { email: TEST_USERS.volunteer.email } })

  // Name the seeded volunteer as this occurrence's lead via the Session 4 roster page.
  await adminPage.goto("/checkin/roster?shiftType=AM")
  const leadSection = adminPage.locator("section").filter({ has: adminPage.getByRole("heading", { name: "Shift lead for this occurrence" }) })
  await leadSection.locator('select[name="assignedLeadId"]').selectOption({ label: TEST_USERS.volunteer.name })
  await Promise.all([adminPage.waitForNavigation(), leadSection.getByRole("button", { name: "Set lead" }).click()])

  await volunteerPage.goto("/checkin/shift-report?shiftType=AM")
  await expect(volunteerPage.getByRole("heading", { name: /End-of-Shift Report/ })).toBeVisible()
  await volunteerPage.locator("label", { hasText: "General shift notes" }).locator("textarea").fill("Quiet shift, no issues.")
  await Promise.all([volunteerPage.waitForNavigation(), volunteerPage.getByRole("button", { name: "Submit report" }).click()])
  await expect(volunteerPage.getByText("Report submitted.")).toBeVisible()

  const report = await prisma.shiftReport.findFirstOrThrow({ where: { shift: { date: new Date(todayString), type: "AM" } } })
  expect(report.submittedById).toBe(seededVolunteer.id)

  // Reloading shows the submitted report read-only, not a second submission form.
  await volunteerPage.goto("/checkin/shift-report?shiftType=AM")
  await expect(volunteerPage.getByText("Quiet shift, no issues.")).toBeVisible()
  await expect(volunteerPage.getByRole("button", { name: "Submit report" })).not.toBeVisible()

  // The same plain Volunteer, viewing a different occurrence (PM) they were never named lead
  // for, gets the read-only "not permitted" message instead of a submission form.
  await volunteerPage.goto("/checkin/shift-report?shiftType=PM")
  await expect(volunteerPage.getByText(/Only this shift's assigned lead or an Admin can submit/)).toBeVisible()
  await expect(volunteerPage.getByRole("button", { name: "Submit report" })).not.toBeVisible()
})
