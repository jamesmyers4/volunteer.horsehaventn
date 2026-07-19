import { test, expect } from "./fixtures"
import { prisma } from "./helpers/db"

test("the daily dashboard shows feeding, medication, health, and location at a glance for an active horse", async ({ volunteerPage }) => {
  const animal = await prisma.animal.create({ data: { name: "Juno", status: "ACTIVE" } })
  const feedType = await prisma.feedType.findFirstOrThrow({ where: { name: "Senior" } })
  await prisma.feedingBaseline.create({ data: { animalId: animal.id, feedTypeId: feedType.id, shift: "AM", amount: "1" } })
  await prisma.healthIssue.create({ data: { animalId: animal.id, description: "Mild nasal discharge", startDate: new Date("2026-07-15") } })
  const location = await prisma.location.findFirstOrThrow({ where: { fieldCode: "L6" } })
  const admin = await prisma.volunteer.findFirstOrThrow({ where: { role: "ADMIN" } })
  await prisma.animalLocationAssignment.create({
    data: { animalId: animal.id, locationId: location.id, period: "DAY", effectiveAt: new Date("2026-07-01"), recordedById: admin.id }
  })

  await volunteerPage.goto("/dashboard")

  const row = volunteerPage.locator("tr", { hasText: "Juno" })
  await expect(row.getByText("L6")).toBeVisible()
  await expect(row.getByText(/Senior/)).toBeVisible()
  await expect(row.getByText("Mild nasal discharge")).toBeVisible()
  await expect(row.getByText("No plan")).not.toBeVisible()
})

test("the dashboard only lists ACTIVE horses", async ({ volunteerPage }) => {
  await prisma.animal.create({ data: { name: "Active One", status: "ACTIVE" } })
  await prisma.animal.create({ data: { name: "Adopted Away", status: "ADOPTED" } })

  await volunteerPage.goto("/dashboard")

  await expect(volunteerPage.getByRole("link", { name: "Active One" })).toBeVisible()
  await expect(volunteerPage.getByRole("link", { name: "Adopted Away" })).not.toBeVisible()
})

test("the dashboard is read-only — no logging forms appear", async ({ shiftLeadPage }) => {
  await prisma.animal.create({ data: { name: "Reed", status: "ACTIVE" } })
  await shiftLeadPage.goto("/dashboard")
  await expect(shiftLeadPage.locator("form")).toHaveCount(0)
})
