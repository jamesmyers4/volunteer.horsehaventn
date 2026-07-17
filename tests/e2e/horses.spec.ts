import { test, expect } from "./fixtures"
import { prisma } from "./helpers/db"

test("an Admin creates a horse, sees it in the list, and edits it", async ({ adminPage }) => {
  await adminPage.goto("/horses/new")
  await adminPage.getByLabel("Name").fill("Juniper")
  await adminPage.getByLabel("Sex").selectOption({ label: "Mare" })
  await adminPage.getByRole("button", { name: "Create horse" }).click()

  await expect(adminPage.getByRole("heading", { name: "Juniper" })).toBeVisible()

  await adminPage.goto("/horses")
  await expect(adminPage.getByRole("link", { name: "Juniper" })).toBeVisible()

  await adminPage.getByRole("link", { name: "Juniper" }).click()
  await adminPage.getByRole("link", { name: "Edit" }).click()
  await adminPage.getByLabel("Name").fill("Juniper Rose")
  await adminPage.getByRole("button", { name: "Save changes" }).click()

  await expect(adminPage.getByRole("heading", { name: "Juniper Rose" })).toBeVisible()

  const horse = await prisma.horse.findFirstOrThrow({ where: { name: "Juniper Rose" } })
  const changeLogEntries = await prisma.changeLog.findMany({ where: { entityType: "Horse", entityId: horse.id } })
  expect(changeLogEntries.length).toBeGreaterThan(0)
})

test("a Shift Lead cannot create a horse via direct navigation", async ({ shiftLeadPage }) => {
  await shiftLeadPage.goto("/horses/new")
  await expect(shiftLeadPage.getByText("Not authorized")).toBeVisible()
  expect(await prisma.horse.count()).toBe(0)
})

test("any signed-in volunteer can browse the horse list read-only", async ({ volunteerPage }) => {
  await prisma.horse.create({ data: { name: "Comet", status: "ACTIVE" } })
  await volunteerPage.goto("/horses")
  await expect(volunteerPage.getByRole("link", { name: "Comet" })).toBeVisible()
  await expect(volunteerPage.getByRole("link", { name: "Add horse" })).toBeVisible()

  await volunteerPage.getByRole("link", { name: "Add horse" }).click()
  await expect(volunteerPage.getByText("Not authorized")).toBeVisible()
})

test("the horse list defaults to ACTIVE only, with a toggle to show all statuses", async ({ volunteerPage }) => {
  await prisma.horse.create({ data: { name: "Active Horse", status: "ACTIVE" } })
  await prisma.horse.create({ data: { name: "Adopted Horse", status: "ADOPTED" } })

  await volunteerPage.goto("/horses")
  await expect(volunteerPage.getByRole("link", { name: "Active Horse" })).toBeVisible()
  await expect(volunteerPage.getByRole("link", { name: "Adopted Horse" })).not.toBeVisible()

  await volunteerPage.getByRole("link", { name: "Show all" }).click()
  await expect(volunteerPage.getByRole("link", { name: "Adopted Horse" })).toBeVisible()
})
