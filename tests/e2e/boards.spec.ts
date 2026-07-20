import { test, expect } from "./fixtures"
import { prisma } from "./helpers/db"

// Builds a small in-browser PNG (via canvas) so tests don't need real fixture image files on
// disk — any already-open page can host the canvas, it doesn't need to be a specific app page.
async function makeTestImage(page: import("@playwright/test").Page, width: number, height: number, color: string) {
  const dataUrl = await page.evaluate(
    ({ width, height, color }) => {
      const canvas = document.createElement("canvas")
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext("2d")!
      ctx.fillStyle = color
      ctx.fillRect(0, 0, width, height)
      return canvas.toDataURL("image/png")
    },
    { width, height, color }
  )
  return Buffer.from(dataUrl.split(",")[1], "base64")
}

test("the Feed Board shows current feed/hay/meds/instructions, with today's override taking precedence over the baseline", async ({
  volunteerPage
}) => {
  const animal = await prisma.animal.create({ data: { name: "Juno", status: "ACTIVE" } })
  const senior = await prisma.feedType.findFirstOrThrow({ where: { name: "Senior" } })
  const hay = await prisma.feedType.findFirstOrThrow({ where: { name: "Hay" } })
  const baseline = await prisma.feedingBaseline.create({
    data: { animalId: animal.id, feedTypeId: senior.id, shift: "AM", amount: "1", notes: "Feed slowly" }
  })
  await prisma.feedingBaseline.create({ data: { animalId: animal.id, feedTypeId: hay.id, shift: "AM", amount: "2" } })
  const admin = await prisma.volunteer.findFirstOrThrow({ where: { role: "ADMIN" } })
  await prisma.feedingOverride.create({
    data: { feedingBaselineId: baseline.id, date: new Date(new Date().toISOString().slice(0, 10)), amount: "0.5", changedBy: admin.id }
  })
  await prisma.medicationRegimen.create({
    data: { animalId: animal.id, drugName: "Bute", dose: "1g", frequency: "daily", startDate: new Date("2026-01-01") }
  })

  await volunteerPage.goto("/feed-board")

  const row = volunteerPage.locator("tr", { hasText: "Juno" })
  await expect(row.getByText("0.5 scoop")).toBeVisible()
  await expect(row.getByText("1 scoop")).not.toBeVisible()
  await expect(row.getByText("2 flake")).toBeVisible()
  await expect(row.getByText("Bute")).toBeVisible()
  await expect(row.getByText("Feed slowly")).toBeVisible()
})

test("the Feed Board shows Skin Care (CareEntry) and standing Handling Notes as sources distinct from Feed and Meds for the same animal/day", async ({
  volunteerPage
}) => {
  const animal = await prisma.animal.create({
    data: { name: "Marigold", status: "ACTIVE", handlingNotes: "Do not approach from the left — blind in left eye" }
  })
  const senior = await prisma.feedType.findFirstOrThrow({ where: { name: "Senior" } })
  await prisma.feedingBaseline.create({ data: { animalId: animal.id, feedTypeId: senior.id, shift: "AM", amount: "1" } })
  await prisma.medicationRegimen.create({
    data: { animalId: animal.id, drugName: "Bute", dose: "1g", frequency: "daily", startDate: new Date("2026-01-01") }
  })
  const flyMask = await prisma.careType.findFirstOrThrow({ where: { name: "Fly Mask / Spray" } })
  const admin = await prisma.volunteer.findFirstOrThrow({ where: { role: "ADMIN" } })
  await prisma.careEntry.create({
    data: {
      animalId: animal.id,
      careTypeId: flyMask.id,
      date: new Date(new Date().toISOString().slice(0, 10)),
      notes: "Applied fresh fly mask",
      performedBy: admin.id
    }
  })
  const attnFlag = await prisma.careType.findFirstOrThrow({ where: { name: "ATTN / Handling Flag" } })
  await prisma.careEntry.create({
    data: {
      animalId: animal.id,
      careTypeId: attnFlag.id,
      date: new Date(new Date().toISOString().slice(0, 10)),
      notes: "Cold hose if breaths per min exceed 20",
      performedBy: admin.id
    }
  })

  await volunteerPage.goto("/feed-board")
  const row = volunteerPage.locator("tr", { hasText: "Marigold" })

  // Skin Care and Meds are correctly attributed to separate columns, not conflated.
  await expect(row.getByText("Fly Mask / Spray: Applied fresh fly mask")).toBeVisible()
  const medsCell = row.locator("td").nth(4)
  await expect(medsCell.getByText("Fly Mask / Spray")).not.toBeVisible()
  await expect(medsCell.getByText("Bute")).toBeVisible()

  // Handling Notes column carries both the standing Animal.handlingNotes value and today's
  // dated ATTN flag — two distinct sources sharing one column.
  await expect(row.getByText("Do not approach from the left — blind in left eye")).toBeVisible()
  await expect(row.getByText("ATTN: Cold hose if breaths per min exceed 20")).toBeVisible()
})

test("the Feed Board excludes a MedicationRegimen whose endDate is in the past, though its MedicationLog history remains directly queryable", async ({
  volunteerPage
}) => {
  const animal = await prisma.animal.create({ data: { name: "Sundance", status: "ACTIVE" } })
  const expiredRegimen = await prisma.medicationRegimen.create({
    data: {
      animalId: animal.id,
      drugName: "Previcox",
      dose: "227mg",
      frequency: "daily",
      startDate: new Date("2026-06-01"),
      endDate: new Date("2026-07-01")
    }
  })
  await prisma.medicationRegimen.create({
    data: { animalId: animal.id, drugName: "Bute", dose: "1g", frequency: "daily", startDate: new Date("2026-01-01") }
  })
  const admin = await prisma.volunteer.findFirstOrThrow({ where: { role: "ADMIN" } })
  await prisma.medicationLog.create({
    data: { medicationRegimenId: expiredRegimen.id, date: new Date("2026-06-15"), administered: true, administeredBy: admin.id }
  })

  await volunteerPage.goto("/feed-board")
  const row = volunteerPage.locator("tr", { hasText: "Sundance" })
  await expect(row.getByText("Bute")).toBeVisible()
  await expect(row.getByText("Previcox")).not.toBeVisible()

  // The regimen is gone from the "current" board display, but its administration history is
  // still queryable directly — nothing about ending a regimen deletes or hides its MedicationLog.
  const history = await prisma.medicationLog.findMany({ where: { medicationRegimenId: expiredRegimen.id } })
  expect(history).toHaveLength(1)
  expect(history[0].administered).toBe(true)
})

test("the Feed Board links each row to that animal's current location on the Turnout Board", async ({ volunteerPage }) => {
  const animal = await prisma.animal.create({ data: { name: "Piper", status: "ACTIVE" } })
  const location = await prisma.location.findFirstOrThrow({ where: { fieldCode: "L2" } })
  const admin = await prisma.volunteer.findFirstOrThrow({ where: { role: "ADMIN" } })
  await prisma.animalLocationAssignment.create({
    data: { animalId: animal.id, locationId: location.id, period: "DAY", effectiveAt: new Date("2026-07-01"), recordedById: admin.id }
  })

  await volunteerPage.goto("/feed-board")
  const row = volunteerPage.locator("tr", { hasText: "Piper" })
  await row.getByRole("link", { name: "L2" }).click()

  await expect(volunteerPage).toHaveURL(/\/turnout-board\?period=DAY#location-/)
  await expect(volunteerPage.locator("section", { hasText: "L2" }).getByRole("link", { name: "Piper" })).toBeVisible()
})

test("the Turnout Board groups by field and orders animals by herd hierarchy (lead animal at top), unranked animals last", async ({
  volunteerPage
}) => {
  const lead = await prisma.animal.create({ data: { name: "Duke", status: "ACTIVE", herdOrder: 1 } })
  const second = await prisma.animal.create({ data: { name: "Ash", status: "ACTIVE", herdOrder: 2 } })
  const unranked = await prisma.animal.create({ data: { name: "Zeta", status: "ACTIVE" } })
  const location = await prisma.location.findFirstOrThrow({ where: { fieldCode: "L1" } })
  const admin = await prisma.volunteer.findFirstOrThrow({ where: { role: "ADMIN" } })
  // Inserted out of hierarchy order to prove the board sorts by herdOrder, not insertion order.
  for (const animal of [unranked, second, lead]) {
    await prisma.animalLocationAssignment.create({
      data: { animalId: animal.id, locationId: location.id, period: "DAY", effectiveAt: new Date("2026-07-01"), recordedById: admin.id }
    })
  }

  await volunteerPage.goto("/turnout-board?period=DAY")

  // The desktop-expanded and mobile-<details> renderings both exist in the DOM at once (pure
  // CSS breakpoint toggle, no client JS) — a plain CSS locator would match both copies, so use
  // a role-based query, which the browser's accessibility tree naturally excludes the
  // display:none copy from (same reason the a11y-tree-based assertions elsewhere on this page
  // resolve unambiguously to a single element without needing `.first()`).
  const section = volunteerPage.locator("section", { hasText: "L1" })
  const names = await section.getByRole("link").allTextContents()
  expect(names).toEqual(["Duke", "Ash", "Zeta"])
})

test("the day/night toggle reflects the correct AnimalLocationAssignment period", async ({ volunteerPage }) => {
  const animal = await prisma.animal.create({ data: { name: "Comet", status: "ACTIVE" } })
  const dayField = await prisma.location.findFirstOrThrow({ where: { fieldCode: "L3" } })
  const nightStall = await prisma.location.create({ data: { type: "BARN_STALL", name: "Barn 1 Stall 9", barnNumber: 1, stallNumber: 9 } })
  const admin = await prisma.volunteer.findFirstOrThrow({ where: { role: "ADMIN" } })
  await prisma.animalLocationAssignment.create({
    data: { animalId: animal.id, locationId: dayField.id, period: "DAY", effectiveAt: new Date("2026-07-01"), recordedById: admin.id }
  })
  await prisma.animalLocationAssignment.create({
    data: { animalId: animal.id, locationId: nightStall.id, period: "NIGHT", effectiveAt: new Date("2026-07-01"), recordedById: admin.id }
  })

  await volunteerPage.goto("/turnout-board?period=DAY")
  await expect(volunteerPage.locator("section", { hasText: "L3" }).getByRole("link", { name: "Comet" })).toBeVisible()
  await expect(volunteerPage.getByText("Barn 1 Stall 9")).not.toBeVisible()

  await volunteerPage.getByRole("link", { name: "Night (barn)" }).click()
  await expect(volunteerPage.locator("section", { hasText: "Barn 1 Stall 9" }).getByRole("link", { name: "Comet" })).toBeVisible()
  await expect(volunteerPage.getByText("L3", { exact: true })).not.toBeVisible()
})

test("edit affordances on both boards appear only for Admin/Shift-Lead at a desktop breakpoint", async ({ adminPage, openAs }) => {
  // adminPage plus a second role in the same test both depend on Playwright's single
  // per-test `page` fixture — requesting volunteerPage alongside adminPage here would try to
  // sign in twice on the same already-authenticated page (a known gotcha already hit and
  // fixed in events.spec.ts, see HANDOFF.md). openAs() opens a genuinely separate browser
  // context instead.
  const volunteerPage = await openAs("volunteer")
  const animal = await prisma.animal.create({ data: { name: "Reed", status: "ACTIVE" } })
  const feedType = await prisma.feedType.findFirstOrThrow({ where: { name: "Senior" } })
  await prisma.feedingBaseline.create({ data: { animalId: animal.id, feedTypeId: feedType.id, shift: "AM", amount: "1" } })
  const location = await prisma.location.findFirstOrThrow({ where: { fieldCode: "L1" } })
  const admin = await prisma.volunteer.findFirstOrThrow({ where: { role: "ADMIN" } })
  await prisma.animalLocationAssignment.create({
    data: { animalId: animal.id, locationId: location.id, period: "DAY", effectiveAt: new Date("2026-07-01"), recordedById: admin.id }
  })

  // Plain Volunteer: no edit forms on either board, at any viewport.
  await volunteerPage.goto("/feed-board")
  await expect(volunteerPage.locator("form")).toHaveCount(0)
  await volunteerPage.goto("/turnout-board?period=DAY")
  await expect(volunteerPage.locator("form")).toHaveCount(0)

  // Admin at a desktop viewport (default Desktop Chrome project, 1280x720 — above the lg
  // breakpoint): edit forms are present and visible.
  await adminPage.goto("/feed-board")
  await expect(adminPage.locator("form").first()).toBeVisible()
  await adminPage.goto("/turnout-board?period=DAY")
  await expect(adminPage.locator("form").first()).toBeVisible()

  // Same Admin, mobile-width viewport: the forms still exist in the DOM (server-rendered
  // either way) but are hidden by the `hidden lg:*` breakpoint classes, not shown.
  await adminPage.setViewportSize({ width: 500, height: 800 })
  await adminPage.goto("/feed-board")
  await expect(adminPage.locator("form").first()).not.toBeVisible()
  await adminPage.goto("/turnout-board?period=DAY")
  await expect(adminPage.locator("form").first()).not.toBeVisible()
})

test("mobile viewport uses tap-to-reveal for a field's animal list on the Turnout Board; desktop shows it expanded by default", async ({
  volunteerPage
}) => {
  const animal = await prisma.animal.create({ data: { name: "Sable", status: "ACTIVE" } })
  const location = await prisma.location.findFirstOrThrow({ where: { fieldCode: "L1" } })
  const admin = await prisma.volunteer.findFirstOrThrow({ where: { role: "ADMIN" } })
  await prisma.animalLocationAssignment.create({
    data: { animalId: animal.id, locationId: location.id, period: "DAY", effectiveAt: new Date("2026-07-01"), recordedById: admin.id }
  })

  // Desktop (default viewport): expanded already, no tap needed.
  await volunteerPage.goto("/turnout-board?period=DAY")
  await expect(volunteerPage.locator("section", { hasText: "L1" }).getByRole("link", { name: "Sable" }).first()).toBeVisible()

  // Mobile: collapsed behind <summary> until tapped.
  await volunteerPage.setViewportSize({ width: 500, height: 800 })
  await volunteerPage.goto("/turnout-board?period=DAY")
  const section = volunteerPage.locator("section", { hasText: "L1" })
  await expect(section.getByRole("link", { name: "Sable" })).not.toBeVisible()
  await section.getByText(/tap to view/).click()
  await expect(section.getByRole("link", { name: "Sable" })).toBeVisible()
})

test("uploading a headshot produces a square photo regardless of the source image's aspect ratio", async ({ adminPage }) => {
  const animal = await prisma.animal.create({ data: { name: "Onyx", status: "ACTIVE" } })

  await adminPage.goto(`/animals/${animal.id}`)

  const landscape = await makeTestImage(adminPage, 400, 200, "#3366cc")
  await adminPage.getByLabel("Headshot photo file").setInputFiles({ name: "landscape.png", mimeType: "image/png", buffer: landscape })
  await expect(adminPage.getByLabel("Headshot crop preview")).toBeVisible()
  await adminPage.getByRole("button", { name: "Use this headshot" }).click()
  // The page is already on /animals/{id} before the upload (waitForURL against that same
  // pattern would resolve instantly without ever waiting for the upload+redirect to actually
  // happen) — wait for the new photo to actually render in the gallery instead, which only
  // happens once the upload has genuinely completed and the page has re-rendered.
  await expect(adminPage.getByAltText("Onyx - PROFILE")).toBeVisible()

  const photo = await prisma.animalPhoto.findFirstOrThrow({ where: { animalId: animal.id, type: "PROFILE" } })
  const isSquare = await adminPage.evaluate(async (url) => {
    const img = new Image()
    img.src = url
    await img.decode()
    return img.naturalWidth === img.naturalHeight
  }, photo.url)
  expect(isSquare).toBe(true)
})
