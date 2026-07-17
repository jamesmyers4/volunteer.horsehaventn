import { test, expect } from "./fixtures"
import { prisma } from "./helpers/db"

test("an Admin sets a feeding baseline, then a Shift Lead logs today's override", async ({ adminPage, openAs }) => {
  const horse = await prisma.horse.create({ data: { name: "Delta", status: "ACTIVE" } })

  await adminPage.goto(`/horses/${horse.id}`)
  const baselineForm = adminPage.locator("form").filter({ hasText: "Add feeding baseline" })
  await baselineForm.getByRole("combobox").selectOption({ label: "Senior" })
  await baselineForm.getByLabel("AM", { exact: true }).check()
  await baselineForm.getByPlaceholder("amount").fill("1.5")
  await baselineForm.getByRole("button", { name: "Add baseline" }).click()

  await expect(adminPage.getByText("1.5 scoop")).toBeVisible()

  const shiftLeadPage = await openAs("shiftLead")
  await shiftLeadPage.goto(`/horses/${horse.id}`)
  const overrideForm = shiftLeadPage.locator("form").filter({ hasText: "Log for today" })
  await overrideForm.getByPlaceholder("amount (optional)").fill("0.5")
  await overrideForm.getByPlaceholder("reason").fill("vet-directed reduction")
  await overrideForm.getByRole("button", { name: "Log for today" }).click()

  await expect(shiftLeadPage.getByText(/0\.5 scoop.*vet-directed reduction/)).toBeVisible()

  const baseline = await prisma.feedingBaseline.findFirstOrThrow({ where: { horseId: horse.id } })
  const override = await prisma.feedingOverride.findFirstOrThrow({ where: { feedingBaselineId: baseline.id } })
  expect(override.amount?.toString()).toBe("0.5")
})

test("a plain Volunteer sees the feeding plan but not the baseline or override forms", async ({ volunteerPage }) => {
  const horse = await prisma.horse.create({ data: { name: "Echo", status: "ACTIVE" } })
  const feedType = await prisma.feedType.findFirstOrThrow({ where: { name: "Senior" } })
  await prisma.feedingBaseline.create({ data: { horseId: horse.id, feedTypeId: feedType.id, shift: "AM", amount: "1" } })

  await volunteerPage.goto(`/horses/${horse.id}`)
  await expect(volunteerPage.getByText("1 scoop")).toBeVisible()
  await expect(volunteerPage.getByText("Add feeding baseline")).not.toBeVisible()
  await expect(volunteerPage.getByPlaceholder("amount (optional)")).not.toBeVisible()
})
