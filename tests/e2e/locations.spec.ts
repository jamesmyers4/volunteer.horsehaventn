import { test, expect } from "./fixtures"
import { prisma } from "./helpers/db"

test("an Admin moves a horse to a new field, and the prior day assignment stays in history", async ({ adminPage }) => {
  const animal = await prisma.animal.create({ data: { name: "Sable", status: "ACTIVE" } })
  const locationL1 = await prisma.location.findFirstOrThrow({ where: { fieldCode: "L1" } })
  const locationL2 = await prisma.location.findFirstOrThrow({ where: { fieldCode: "L2" } })
  const admin = await prisma.volunteer.findFirstOrThrow({ where: { role: "ADMIN" } })
  await prisma.animalLocationAssignment.create({
    data: { animalId: animal.id, locationId: locationL1.id, period: "DAY", effectiveAt: new Date("2026-06-01"), recordedById: admin.id }
  })

  await adminPage.goto(`/animals/${animal.id}`)
  await expect(adminPage.locator("p", { hasText: "Day:" })).toContainText("L1")

  const moveForm = adminPage.locator("form").filter({ has: adminPage.getByRole("button", { name: "Move" }) })
  await moveForm.getByRole("combobox").first().selectOption({ label: "L2" })
  await moveForm.getByRole("button", { name: "Move" }).click()

  await expect(adminPage.locator("p", { hasText: "Day:" })).toContainText("L2")

  const rows = await prisma.animalLocationAssignment.findMany({ where: { animalId: animal.id }, orderBy: { effectiveAt: "asc" } })
  expect(rows).toHaveLength(2)
  expect(rows[0].locationId).toBe(locationL1.id)
  expect(rows[1].locationId).toBe(locationL2.id)

  await adminPage.getByText("View history").click()
  await expect(adminPage.getByText(/DAY: L1/)).toBeVisible()
  await expect(adminPage.getByText(/DAY: L2/)).toBeVisible()
})

test("location assignment is Admin/Shift-Lead only — a plain Volunteer sees the current location read-only with no move form", async ({
  volunteerPage
}) => {
  const animal = await prisma.animal.create({ data: { name: "Onyx", status: "ACTIVE" } })
  const location = await prisma.location.findFirstOrThrow({ where: { fieldCode: "L3" } })
  const admin = await prisma.volunteer.findFirstOrThrow({ where: { role: "ADMIN" } })
  await prisma.animalLocationAssignment.create({
    data: { animalId: animal.id, locationId: location.id, period: "DAY", effectiveAt: new Date("2026-06-01"), recordedById: admin.id }
  })

  await volunteerPage.goto(`/animals/${animal.id}`)
  await expect(volunteerPage.locator("p", { hasText: "Day:" })).toContainText("L3")
  await expect(volunteerPage.getByRole("button", { name: "Move" })).not.toBeVisible()
})

test("a Shift Lead can move a horse, tracking day and night locations independently", async ({ shiftLeadPage }) => {
  const animal = await prisma.animal.create({ data: { name: "Reed", status: "ACTIVE" } })
  const dayField = await prisma.location.findFirstOrThrow({ where: { fieldCode: "L4" } })
  const nightStall = await prisma.location.create({ data: { type: "BARN_STALL", name: "Barn 1 Stall 5", barnNumber: 1, stallNumber: 5 } })

  await shiftLeadPage.goto(`/animals/${animal.id}`)
  const moveForm = shiftLeadPage.locator("form").filter({ has: shiftLeadPage.getByRole("button", { name: "Move" }) })
  await moveForm.getByRole("combobox").first().selectOption({ label: "L4" })
  await moveForm.getByLabel("Day").check()
  await moveForm.getByRole("button", { name: "Move" }).click()

  // The single move form is reused for both periods — wait for the Day assignment to land
  // (a full page redirect/re-render) before touching the reused form again for Night, so the
  // second submission isn't racing the first one's navigation.
  await expect(shiftLeadPage.locator("p", { hasText: "Day:" })).toContainText("L4")

  await moveForm.getByRole("combobox").first().selectOption({ label: "Barn 1 Stall 5" })
  await moveForm.getByLabel("Night").check()
  await moveForm.getByRole("button", { name: "Move" }).click()

  await expect(shiftLeadPage.locator("p", { hasText: "Night:" })).toContainText("Barn 1 Stall 5")
  await expect(shiftLeadPage.locator("p", { hasText: "Day:" })).toContainText("L4")

  const day = await prisma.animalLocationAssignment.findFirstOrThrow({ where: { animalId: animal.id, period: "DAY" } })
  const night = await prisma.animalLocationAssignment.findFirstOrThrow({ where: { animalId: animal.id, period: "NIGHT" } })
  expect(day.locationId).toBe(dayField.id)
  expect(night.locationId).toBe(nightStall.id)
})

test("the Locations page lists which horses currently occupy each field", async ({ volunteerPage }) => {
  const animal = await prisma.animal.create({ data: { name: "Piper", status: "ACTIVE" } })
  const location = await prisma.location.findFirstOrThrow({ where: { fieldCode: "L5" } })
  const admin = await prisma.volunteer.findFirstOrThrow({ where: { role: "ADMIN" } })
  await prisma.animalLocationAssignment.create({
    data: { animalId: animal.id, locationId: location.id, period: "DAY", effectiveAt: new Date("2026-07-01"), recordedById: admin.id }
  })

  await volunteerPage.goto("/locations")
  const row = volunteerPage.locator("tr", { hasText: "L5" })
  await expect(row.getByRole("link", { name: "Piper" })).toBeVisible()
})

test("Location history is not shown by default — only behind the 'View history' expand", async ({ adminPage }) => {
  const animal = await prisma.animal.create({ data: { name: "Comet", status: "ACTIVE" } })
  const location = await prisma.location.findFirstOrThrow({ where: { fieldCode: "L1" } })
  const admin = await prisma.volunteer.findFirstOrThrow({ where: { role: "ADMIN" } })
  await prisma.animalLocationAssignment.create({
    data: { animalId: animal.id, locationId: location.id, period: "DAY", effectiveAt: new Date("2026-07-01"), recordedById: admin.id }
  })

  await adminPage.goto(`/animals/${animal.id}`)
  await expect(adminPage.getByText(/DAY: L1/)).not.toBeVisible()
})
