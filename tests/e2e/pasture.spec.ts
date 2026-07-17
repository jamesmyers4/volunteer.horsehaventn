import { test, expect } from "./fixtures"
import { prisma } from "./helpers/db"

test("an Admin moves a horse to a new field, closing out the previous assignment", async ({ adminPage }) => {
  const horse = await prisma.horse.create({ data: { name: "Sable", status: "ACTIVE" } })
  const fieldL1 = await prisma.field.findFirstOrThrow({ where: { code: "L1" } })
  const fieldL2 = await prisma.field.findFirstOrThrow({ where: { code: "L2" } })
  await prisma.pastureAssignment.create({ data: { horseId: horse.id, fieldId: fieldL1.id, startDate: new Date("2026-06-01") } })

  await adminPage.goto(`/horses/${horse.id}`)
  await expect(adminPage.locator("p", { hasText: "Currently in:" })).toContainText("L1")

  const moveForm = adminPage.locator("form").filter({ has: adminPage.getByRole("button", { name: "Move to field" }) })
  await moveForm.getByRole("combobox").selectOption({ label: "L2" })
  await moveForm.getByRole("button", { name: "Move to field" }).click()

  await expect(adminPage.getByText("Currently in:")).toBeVisible()
  await expect(adminPage.locator("p", { hasText: "Currently in:" })).toContainText("L2")

  const openAssignments = await prisma.pastureAssignment.findMany({ where: { horseId: horse.id, endDate: null } })
  expect(openAssignments).toHaveLength(1)
  expect(openAssignments[0].fieldId).toBe(fieldL2.id)

  const history = await prisma.pastureAssignment.findMany({ where: { horseId: horse.id, endDate: { not: null } } })
  expect(history).toHaveLength(1)
  expect(history[0].fieldId).toBe(fieldL1.id)
})

test("pasture assignment is Admin-only — a Shift Lead sees history read-only with no move form", async ({ shiftLeadPage }) => {
  const horse = await prisma.horse.create({ data: { name: "Onyx", status: "ACTIVE" } })
  const field = await prisma.field.findFirstOrThrow({ where: { code: "L3" } })
  await prisma.pastureAssignment.create({ data: { horseId: horse.id, fieldId: field.id, startDate: new Date("2026-06-01") } })

  await shiftLeadPage.goto(`/horses/${horse.id}`)
  await expect(shiftLeadPage.locator("p", { hasText: "Currently in:" })).toContainText("L3")
  await expect(shiftLeadPage.getByRole("button", { name: "Move to field" })).not.toBeVisible()
})

test("the Fields page lists which horses currently occupy each field", async ({ volunteerPage }) => {
  const horse = await prisma.horse.create({ data: { name: "Piper", status: "ACTIVE" } })
  const field = await prisma.field.findFirstOrThrow({ where: { code: "L5" } })
  await prisma.pastureAssignment.create({ data: { horseId: horse.id, fieldId: field.id, startDate: new Date("2026-07-01") } })

  await volunteerPage.goto("/fields")
  const row = volunteerPage.locator("tr", { hasText: "L5" })
  await expect(row.getByRole("link", { name: "Piper" })).toBeVisible()
})
