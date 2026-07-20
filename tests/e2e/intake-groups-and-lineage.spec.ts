import { test, expect } from "./fixtures"
import { prisma } from "./helpers/db"

test("an Admin creates an intake group, assigns two animals to it, and each animal links back to the group listing both members", async ({
  adminPage
}) => {
  await adminPage.goto("/intake-groups")
  await adminPage.getByPlaceholder("label (e.g. Irish Group)").fill("Irish Group")
  await adminPage.locator("input[name=intakeDate]").fill("2026-06-01")
  await adminPage.getByRole("button", { name: "Add group" }).click()

  await expect(adminPage.getByRole("heading", { name: "Irish Group" })).toBeVisible()
  const group = await prisma.intakeGroup.findFirstOrThrow({ where: { label: "Irish Group" } })

  const rowan = await prisma.animal.create({ data: { name: "Rowan", status: "ACTIVE" } })
  const shannon = await prisma.animal.create({ data: { name: "Shannon", status: "ACTIVE" } })

  for (const animal of [rowan, shannon]) {
    await adminPage.goto(`/animals/${animal.id}`)
    await adminPage.locator("select[name=intakeGroupId]").selectOption({ label: "Irish Group" })
    await adminPage.getByRole("button", { name: "Save" }).click()
    await expect(adminPage.getByRole("link", { name: "Irish Group" })).toBeVisible()
  }

  await adminPage.goto(`/intake-groups/${group.id}`)
  await expect(adminPage.getByRole("link", { name: "Rowan" })).toBeVisible()
  await expect(adminPage.getByRole("link", { name: "Shannon" })).toBeVisible()
})

test("intake group assignment is Admin-or-Shift-Lead — a plain Volunteer sees no assign form", async ({ volunteerPage }) => {
  const animal = await prisma.animal.create({ data: { name: "Onyx", status: "ACTIVE" } })
  await volunteerPage.goto(`/animals/${animal.id}`)
  await expect(volunteerPage.locator("select[name=intakeGroupId]")).not.toBeVisible()
})

test("a Shift Lead records Guinness SIRE_OF Rowan; both animal pages show the relationship in the correct direction", async ({
  shiftLeadPage
}) => {
  const guinness = await prisma.animal.create({ data: { name: "Guinness", status: "ACTIVE" } })
  const rowan = await prisma.animal.create({ data: { name: "Rowan", status: "ACTIVE" } })

  await shiftLeadPage.goto(`/animals/${guinness.id}`)
  const relForm = shiftLeadPage.locator("form").filter({ has: shiftLeadPage.getByRole("button", { name: "Add relationship" }) })
  await relForm.locator("select[name=relatedAnimalId]").selectOption({ label: "Rowan" })
  await relForm.locator("select[name=relationType]").selectOption("SIRE_OF")
  await relForm.getByRole("button", { name: "Add relationship" }).click()

  await expect(shiftLeadPage.locator("li", { hasText: "Sire of Rowan" })).toBeVisible()

  await shiftLeadPage.goto(`/animals/${rowan.id}`)
  await expect(shiftLeadPage.locator("li", { hasText: "Sire Guinness" })).toBeVisible()
})

test("relationship add form is hidden for a plain Volunteer, who still sees existing relationships read-only", async ({ volunteerPage }) => {
  const guinness = await prisma.animal.create({ data: { name: "Guinness", status: "ACTIVE" } })
  const rowan = await prisma.animal.create({ data: { name: "Rowan", status: "ACTIVE" } })
  const admin = await prisma.volunteer.findFirstOrThrow({ where: { role: "ADMIN" } })
  await prisma.animalRelationship.create({
    data: { animalId: guinness.id, relatedAnimalId: rowan.id, relationType: "SIRE_OF", recordedById: admin.id }
  })

  await volunteerPage.goto(`/animals/${guinness.id}`)
  await expect(volunteerPage.locator("li", { hasText: "Sire of Rowan" })).toBeVisible()
  await expect(volunteerPage.getByRole("button", { name: "Add relationship" })).not.toBeVisible()
})

test("an Admin records a placement, adopting the animal and freezing HHT Days at the placement date", async ({ adminPage }) => {
  const animal = await prisma.animal.create({ data: { name: "Comet", status: "ACTIVE", intakeDate: new Date("2026-01-01") } })

  await adminPage.goto(`/animals/${animal.id}`)
  const placementForm = adminPage.locator("form").filter({ has: adminPage.getByRole("button", { name: "Record placement" } ) })
  await placementForm.getByPlaceholder("adopter name").fill("The Rivera Family")
  await placementForm.getByPlaceholder("adopter contact (optional)").fill("555-0100")
  await placementForm.locator("input[name=placedDate]").fill("2026-01-11")
  await placementForm.getByRole("button", { name: "Record placement" }).click()

  await expect(adminPage.getByText("Adopted by")).toBeVisible()
  await expect(adminPage.getByText("The Rivera Family")).toBeVisible()
  await expect(adminPage.locator("dd", { hasText: "ADOPTED" })).toBeVisible()
  await expect(adminPage.locator("dd").filter({ hasText: /^10$/ })).toBeVisible()

  await expect(adminPage.getByRole("button", { name: "Record placement" })).not.toBeVisible()
})

test("co-adopting two animals together shares one placementGroupId and cross-links them as adopted together", async ({ adminPage }) => {
  const rowan = await prisma.animal.create({ data: { name: "Rowan", status: "ACTIVE" } })
  const shannon = await prisma.animal.create({ data: { name: "Shannon", status: "ACTIVE" } })

  await adminPage.goto(`/animals/${rowan.id}`)
  const placementForm = adminPage.locator("form").filter({ has: adminPage.getByRole("button", { name: "Record placement" } ) })
  await placementForm.getByPlaceholder("adopter name").fill("The Smiths")
  await placementForm.locator("input[name=placedDate]").fill("2026-07-01")
  await placementForm.getByLabel("Shannon").check()
  await placementForm.getByRole("button", { name: "Record placement" }).click()

  await expect(adminPage.getByText("Adopted together with")).toBeVisible()
  await expect(adminPage.getByRole("link", { name: "Shannon" })).toBeVisible()

  await adminPage.goto(`/animals/${shannon.id}`)
  await expect(adminPage.getByText("Adopted together with")).toBeVisible()
  await expect(adminPage.getByRole("link", { name: "Rowan" })).toBeVisible()

  const rowanPlacement = await prisma.placement.findFirstOrThrow({ where: { animalId: rowan.id } })
  const shannonPlacement = await prisma.placement.findFirstOrThrow({ where: { animalId: shannon.id } })
  expect(rowanPlacement.placementGroupId).toBe(shannonPlacement.placementGroupId)
})

test("FOSTER and PENDING_ADOPTION animals are visible under 'Show all' on the horse list", async ({ volunteerPage }) => {
  await prisma.animal.create({ data: { name: "FosterHorse", status: "FOSTER" } })
  await prisma.animal.create({ data: { name: "PendingHorse", status: "PENDING_ADOPTION" } })

  await volunteerPage.goto("/animals?status=all")
  await expect(volunteerPage.getByRole("link", { name: "FosterHorse" })).toBeVisible()
  await expect(volunteerPage.getByRole("link", { name: "PendingHorse" })).toBeVisible()
})
