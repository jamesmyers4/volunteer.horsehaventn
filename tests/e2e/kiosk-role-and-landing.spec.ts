import { test, expect } from "./fixtures"
import { prisma } from "./helpers/db"

// V4.md Session 1: role-based landing route after sign-in, plus KIOSK's stripped-down,
// genuinely read-only layout. KIOSK/VOLUNTEER/SHIFT_LEAD/ADMIN all get redirected off the
// homepage's flat link list — GUEST isn't named in V4.md's landing-route table, so it's
// deliberately not covered here (see src/lib/auth.ts's landingRouteForRole).

test("KIOSK lands on the Feed Board after sign-in, not the flat homepage link list", async ({ kioskPage }) => {
  await kioskPage.goto("/")
  await expect(kioskPage).toHaveURL(/\/feed-board$/)
  await expect(kioskPage.getByRole("heading", { name: "Feed Board" })).toBeVisible()
})

test("VOLUNTEER and SHIFT_LEAD land on the check-in page after sign-in", async ({ volunteerPage, openAs }) => {
  // Two named page fixtures (volunteerPage + shiftLeadPage) in one test both depend on
  // Playwright's single per-test `page` — a known Clerk "already signed in" gotcha this
  // codebase has hit and fixed before (see HANDOFF.md, e.g. events.spec.ts/boards.spec.ts).
  // openAs() opens a genuinely separate browser context for the second actor instead.
  const shiftLeadPage = await openAs("shiftLead")

  await volunteerPage.goto("/")
  await expect(volunteerPage).toHaveURL(/\/checkin$/)

  await shiftLeadPage.goto("/")
  await expect(shiftLeadPage).toHaveURL(/\/checkin$/)
})

test("ADMIN lands on the Admin Console after sign-in", async ({ adminPage }) => {
  await adminPage.goto("/")
  await expect(adminPage).toHaveURL(/\/admin$/)
  await expect(adminPage.getByRole("heading", { name: "Admin Console" })).toBeVisible()
})

// The homepage's flat link list (Dashboard/Check in/Admin Console/etc.) is the only app-wide
// nav in this codebase — landing KIOSK on the Feed Board instead means it never renders, which
// is what "no admin nav, no check-in nav" (V4.md's own phrasing) comes down to in practice.
test("KIOSK never sees the homepage's admin/check-in nav links, on the homepage or its own landing page", async ({ kioskPage }) => {
  await kioskPage.goto("/")
  await expect(kioskPage.getByRole("link", { name: "Admin Console" })).not.toBeVisible()
  await expect(kioskPage.getByRole("link", { name: "Check in" })).not.toBeVisible()
  await expect(kioskPage.getByRole("link", { name: "Dashboard" })).not.toBeVisible()

  await kioskPage.goto("/feed-board")
  await expect(kioskPage.getByRole("link", { name: "Admin Console" })).not.toBeVisible()
  await expect(kioskPage.getByRole("link", { name: "Check in" })).not.toBeVisible()
})

// KIOSK typing a restricted URL directly (not clicking a nav link, since none is shown) must
// still be turned away by the page's own permission check — the same "not just hidden from
// nav" boundary admin.spec.ts already establishes for a Shift Lead against /admin.
test("KIOSK navigating directly to an Admin-only URL is still blocked by the underlying permission check", async ({ kioskPage }) => {
  await kioskPage.goto("/admin")
  await expect(kioskPage.getByText("Not authorized")).toBeVisible()
})

test("KIOSK navigating directly to the Animal create form is still blocked by the underlying permission check", async ({ kioskPage }) => {
  await kioskPage.goto("/animals/new")
  await expect(kioskPage.getByText("Not authorized")).toBeVisible()
})

// KIOSK's read-only guarantee is "genuinely read-only," not "blocked from every page" — the
// Turnout Board (Session 2's other kiosk-facing view) stays reachable and renders zero edit
// affordances for it, same allowlist-based canEdit gating ADMIN/SHIFT_LEAD already rely on
// (see boards.spec.ts's own "no edit affordances for a plain Volunteer" test, which this
// mirrors for KIOSK against real occupant data rather than an empty board).
test("KIOSK can still reach the Turnout Board directly, with no edit affordances rendered", async ({ kioskPage }) => {
  const animal = await prisma.animal.create({ data: { name: "KioskViewTest", status: "ACTIVE" } })
  const location = await prisma.location.findFirstOrThrow({ where: { fieldCode: "L1" } })
  const admin = await prisma.volunteer.findFirstOrThrow({ where: { role: "ADMIN" } })
  await prisma.animalLocationAssignment.create({
    data: { animalId: animal.id, locationId: location.id, period: "DAY", effectiveAt: new Date("2026-07-01"), recordedById: admin.id }
  })

  await kioskPage.goto("/turnout-board?period=DAY")
  await expect(kioskPage.getByRole("heading", { name: "Turnout Board" })).toBeVisible()
  await expect(kioskPage.getByRole("link", { name: "KioskViewTest" })).toBeVisible()
  await expect(kioskPage.locator("form")).toHaveCount(0)
})
