import { test, expect } from "./fixtures"
import { prisma } from "./helpers/db"

test("a Shift Lead opens a health issue, logs a related care entry, then resolves it", async ({ shiftLeadPage }) => {
  const animal = await prisma.animal.create({ data: { name: "Hazel", status: "ACTIVE" } })
  await shiftLeadPage.goto(`/animals/${animal.id}`)

  const issueForm = shiftLeadPage.locator("form").filter({ hasText: "Open health issue" })
  await issueForm.getByPlaceholder("description").fill("Swelling on left hind fetlock")
  await issueForm.getByRole("button", { name: "Open issue" }).click()

  await expect(shiftLeadPage.getByRole("listitem").filter({ hasText: "Swelling on left hind fetlock" })).toBeVisible()

  const careForm = shiftLeadPage.locator("form").filter({ hasText: "Log care entry" })
  await careForm.getByRole("combobox").first().selectOption({ label: "Wound Check" })
  await careForm.getByRole("combobox").nth(1).selectOption({ label: "Swelling on left hind fetlock" })
  await careForm.getByPlaceholder("notes").fill("Slightly reduced from yesterday")
  await careForm.getByRole("button", { name: "Log entry" }).click()

  await expect(shiftLeadPage.getByText(/Slightly reduced from yesterday/)).toBeVisible()

  await shiftLeadPage.getByRole("button", { name: "Resolve" }).click()
  await expect(shiftLeadPage.getByText("None open.")).toBeVisible()

  const issue = await prisma.healthIssue.findFirstOrThrow({ where: { animalId: animal.id } })
  expect(issue.active).toBe(false)
  const entry = await prisma.careEntry.findFirstOrThrow({ where: { animalId: animal.id } })
  expect(entry.relatedHealthIssueId).toBe(issue.id)
})

test("an Admin adds a medication regimen and a Shift Lead logs it given for today", async ({ adminPage, openAs }) => {
  const animal = await prisma.animal.create({ data: { name: "Storm", status: "ACTIVE" } })
  await adminPage.goto(`/animals/${animal.id}`)

  const regimenForm = adminPage.locator("form").filter({ hasText: "Add medication regimen" })
  await regimenForm.getByPlaceholder("drug name").fill("Bute")
  await regimenForm.getByPlaceholder("dose").fill("1g")
  await regimenForm.getByPlaceholder("frequency").fill("Twice daily")
  await regimenForm.getByRole("button", { name: "Add regimen" }).click()

  await expect(adminPage.getByText("Bute")).toBeVisible()

  const shiftLeadPage = await openAs("shiftLead")
  await shiftLeadPage.goto(`/animals/${animal.id}`)
  const logForm = shiftLeadPage.locator("form").filter({ has: shiftLeadPage.getByRole("button", { name: "Log for today" }) })
  await logForm.getByRole("button", { name: "Log for today" }).click()

  await expect(shiftLeadPage.getByText(/Given —/)).toBeVisible()

  const regimen = await prisma.medicationRegimen.findFirstOrThrow({ where: { animalId: animal.id } })
  const log = await prisma.medicationLog.findFirstOrThrow({ where: { medicationRegimenId: regimen.id } })
  expect(log.administered).toBe(true)
})

test("a Shift Lead logs a weight entry and a Henneke BCS metric", async ({ shiftLeadPage }) => {
  const animal = await prisma.animal.create({ data: { name: "Ridge", status: "ACTIVE" } })
  await shiftLeadPage.goto(`/animals/${animal.id}`)

  const weightForm = shiftLeadPage.locator("form").filter({ hasText: "Log weight" })
  await weightForm.getByPlaceholder("weight (lbs)").fill("975.5")
  await weightForm.getByRole("button", { name: "Log weight" }).click()
  await expect(shiftLeadPage.getByText("975.5 lbs")).toBeVisible()

  const metricForm = shiftLeadPage.locator("form").filter({ hasText: "Log metric" })
  await metricForm.getByRole("combobox").selectOption({ label: "Henneke Body Condition Score" })
  await metricForm.getByPlaceholder("value").fill("4.5")
  await metricForm.getByRole("button", { name: "Log metric" }).click()
  await expect(shiftLeadPage.getByText(/Henneke Body Condition Score: 4.5/)).toBeVisible()

  const weight = await prisma.weightEntry.findFirstOrThrow({ where: { animalId: animal.id } })
  expect(weight.weight.toString()).toBe("975.5")
  const metric = await prisma.animalMetric.findFirstOrThrow({ where: { animalId: animal.id } })
  expect(metric.value.toString()).toBe("4.5")
})

test("a plain Volunteer cannot see any care, medication, or metrics logging forms", async ({ volunteerPage }) => {
  const animal = await prisma.animal.create({ data: { name: "Vale", status: "ACTIVE" } })
  await volunteerPage.goto(`/animals/${animal.id}`)

  await expect(volunteerPage.getByText("Add medication regimen")).not.toBeVisible()
  await expect(volunteerPage.getByText("Log care entry")).not.toBeVisible()
  await expect(volunteerPage.getByText("Open health issue", { exact: true })).not.toBeVisible()
  await expect(volunteerPage.getByText("Log weight")).not.toBeVisible()
  await expect(volunteerPage.getByText("Log metric")).not.toBeVisible()
})
