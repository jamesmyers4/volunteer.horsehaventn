import { test, expect } from "./fixtures"
import { prisma } from "./helpers/db"

// V4.md Session 2: Feed Board / Turnout Board Kiosk Experience. Audit finding before writing
// any of this: the Feed Board previously queried every FeedingBaseline regardless of shift
// (AM and PM rows merged into the same cell, ordered but not filtered) — there was no AM/PM
// display at all, automatic or manual. src/lib/feedBoard.ts's resolveFeedBoardShift/
// resolveDisplayedFeedBoardShift (boundary-tested directly in tests/vitest/lib/feedBoard.test.ts)
// and the ?shift= query param on src/app/feed-board/page.tsx are what's new here.

test("the manual AM/PM override on the Feed Board works independently of the automatic switch, and is available under a KIOSK session", async ({
  kioskPage
}) => {
  const animal = await prisma.animal.create({ data: { name: "Lumen", status: "ACTIVE" } })
  const senior = await prisma.feedType.findFirstOrThrow({ where: { name: "Senior" } })
  await prisma.feedingBaseline.create({ data: { animalId: animal.id, feedTypeId: senior.id, shift: "AM", amount: "1" } })
  await prisma.feedingBaseline.create({ data: { animalId: animal.id, feedTypeId: senior.id, shift: "PM", amount: "2" } })

  await kioskPage.goto("/feed-board?shift=AM")
  let row = kioskPage.locator("tr", { hasText: "Lumen" })
  await expect(row.getByText("1 scoop")).toBeVisible()
  await expect(row.getByText("2 scoop")).not.toBeVisible()
  // The toggle itself is a display switch, not a write action, so it's available even though
  // KIOSK fails every write-capable permission check (V4.md Session 1).
  await expect(kioskPage.getByRole("link", { name: "Auto" })).toBeVisible()

  await kioskPage.getByRole("link", { name: "PM", exact: true }).click()
  await expect(kioskPage).toHaveURL(/shift=PM/)
  row = kioskPage.locator("tr", { hasText: "Lumen" })
  await expect(row.getByText("2 scoop")).toBeVisible()
  await expect(row.getByText("1 scoop")).not.toBeVisible()

  // "Auto" clears the override back to the automatic noon-boundary switch.
  await kioskPage.getByRole("link", { name: "Auto" }).click()
  await expect(kioskPage).toHaveURL(/\/feed-board$/)
})

test("the Feed Board's automatic AM/PM display (no override) matches the current time of day", async ({ volunteerPage }) => {
  // Derived with the same noon-boundary rule as src/lib/feedBoard.ts's resolveFeedBoardShift —
  // this doesn't re-test the boundary math itself (tests/vitest/lib/feedBoard.test.ts already
  // covers both sides of noon deterministically), it proves the page is actually wired up to
  // that function end-to-end for whatever time it is right now.
  const expectedShift = new Date().getHours() < 12 ? "AM" : "PM"
  const otherShift = expectedShift === "AM" ? "PM" : "AM"
  const animal = await prisma.animal.create({ data: { name: "Ember", status: "ACTIVE" } })
  const senior = await prisma.feedType.findFirstOrThrow({ where: { name: "Senior" } })
  await prisma.feedingBaseline.create({ data: { animalId: animal.id, feedTypeId: senior.id, shift: expectedShift, amount: "1" } })
  await prisma.feedingBaseline.create({ data: { animalId: animal.id, feedTypeId: senior.id, shift: otherShift, amount: "3" } })

  await volunteerPage.goto("/feed-board")
  const row = volunteerPage.locator("tr", { hasText: "Ember" })
  await expect(row.getByText("1 scoop")).toBeVisible()
  await expect(row.getByText("3 scoop")).not.toBeVisible()
  await expect(volunteerPage.getByRole("link", { name: expectedShift, exact: true })).toHaveClass(/font-semibold/)
})

test("Feed Board -> Turnout Board -> back preserves the Feed Board's current AM/PM state", async ({ volunteerPage }) => {
  const animal = await prisma.animal.create({ data: { name: "Solace", status: "ACTIVE" } })
  const senior = await prisma.feedType.findFirstOrThrow({ where: { name: "Senior" } })
  await prisma.feedingBaseline.create({ data: { animalId: animal.id, feedTypeId: senior.id, shift: "PM", amount: "1.5" } })
  const location = await prisma.location.findFirstOrThrow({ where: { fieldCode: "L1" } })
  const admin = await prisma.volunteer.findFirstOrThrow({ where: { role: "ADMIN" } })
  await prisma.animalLocationAssignment.create({
    data: { animalId: animal.id, locationId: location.id, period: "DAY", effectiveAt: new Date("2026-07-01"), recordedById: admin.id }
  })

  await volunteerPage.goto("/feed-board?shift=PM")
  await volunteerPage.getByRole("link", { name: "View Turnout Board →" }).click()
  await expect(volunteerPage).toHaveURL(/\/turnout-board\?period=DAY&feedShift=PM/)

  await volunteerPage.getByRole("link", { name: "← Back to Feed Board" }).click()
  await expect(volunteerPage).toHaveURL(/\/feed-board\?shift=PM/)
  const row = volunteerPage.locator("tr", { hasText: "Solace" })
  await expect(row.getByText("1.5 scoop")).toBeVisible()
})

test("both boards auto-refresh on the configured interval, re-fetching data rather than only re-rendering stale state", async ({
  volunteerPage
}) => {
  // Playwright's clock only virtualizes client-side timers (setInterval, in AutoRefresh.tsx) —
  // it can't fast-forward the Next.js server's own Date.now(), so this test can't force the
  // noon-boundary switch itself. What it proves is the refresh mechanism actually triggers a
  // fresh server round-trip: an animal created *after* initial load is invisible until the
  // interval fires, then appears without a manual reload.
  await volunteerPage.clock.install()
  await volunteerPage.goto("/feed-board?shift=AM")
  await expect(volunteerPage.getByText("Nova")).not.toBeVisible()

  await prisma.animal.create({ data: { name: "Nova", status: "ACTIVE" } })
  await expect(volunteerPage.getByText("Nova")).not.toBeVisible()

  await volunteerPage.clock.fastForward("30:01")
  await expect(volunteerPage.getByText("Nova")).toBeVisible()

  // Same mechanism, same test, on the Turnout Board.
  const location = await prisma.location.findFirstOrThrow({ where: { fieldCode: "L1" } })
  await volunteerPage.goto("/turnout-board?period=DAY")
  await expect(volunteerPage.getByRole("link", { name: "Nova" })).not.toBeVisible()

  const admin = await prisma.volunteer.findFirstOrThrow({ where: { role: "ADMIN" } })
  const nova = await prisma.animal.findFirstOrThrow({ where: { name: "Nova" } })
  await prisma.animalLocationAssignment.create({
    data: { animalId: nova.id, locationId: location.id, period: "DAY", effectiveAt: new Date("2026-07-01"), recordedById: admin.id }
  })
  await expect(volunteerPage.getByRole("link", { name: "Nova" })).not.toBeVisible()

  await volunteerPage.clock.fastForward("30:01")
  await expect(volunteerPage.getByRole("link", { name: "Nova" })).toBeVisible()
})

test("Turnout Board renders zero edit affordances for a KIOSK viewer at a mobile breakpoint too", async ({ kioskPage }) => {
  // boards.spec.ts's edit-affordance test and kiosk-role-and-landing.spec.ts's own Turnout
  // Board test already confirm KIOSK gets no edit forms at the default desktop viewport — this
  // closes the "at any breakpoint" half of V4.md Session 2's explicit test-coverage ask, since
  // canEdit's role check doesn't vary by viewport but was never actually checked against a
  // narrow one for a KIOSK viewer specifically.
  const animal = await prisma.animal.create({ data: { name: "KioskMobileTest", status: "ACTIVE" } })
  const location = await prisma.location.findFirstOrThrow({ where: { fieldCode: "L1" } })
  const admin = await prisma.volunteer.findFirstOrThrow({ where: { role: "ADMIN" } })
  await prisma.animalLocationAssignment.create({
    data: { animalId: animal.id, locationId: location.id, period: "DAY", effectiveAt: new Date("2026-07-01"), recordedById: admin.id }
  })

  await kioskPage.setViewportSize({ width: 500, height: 800 })
  await kioskPage.goto("/turnout-board?period=DAY")
  // At this breakpoint the animal list is server-rendered but collapsed behind a native
  // <details> tap-to-reveal (boards.spec.ts's own mobile-viewport convention) — expand it
  // before asserting the animal is reachable, then confirm no edit form exists either way.
  const section = kioskPage.locator("section", { hasText: "L1" })
  await section.getByText(/tap to view/).click()
  await expect(section.getByRole("link", { name: "KioskMobileTest" })).toBeVisible()
  await expect(kioskPage.locator("form")).toHaveCount(0)
})
