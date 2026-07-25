import { test, expect } from "./fixtures"

// BUGS.md: the only nav/sign-out in the app used to live on the homepage's flat link list.
// V4.md Session 1's role-based landing redirect (src/lib/auth.ts's landingRouteForRole) sends
// every non-GUEST role straight past that page, so ADMIN landed on /admin, VOLUNTEER/
// SHIFT_LEAD on /checkin, and KIOSK on /feed-board with no way to navigate elsewhere or sign
// out. src/app/NavBar.tsx (rendered globally from src/app/layout.tsx) fixes that; this spec
// covers the scenario the bug report actually described, not just that the nav component exists.

test("ADMIN has global nav and a working sign-out control on their own landing page", async ({ adminPage }) => {
  await adminPage.goto("/")
  await expect(adminPage).toHaveURL(/\/admin$/)

  await expect(adminPage.getByRole("navigation", { name: "Main" })).toBeVisible()
  await expect(adminPage.getByRole("link", { name: "Dashboard" })).toBeVisible()
  await expect(adminPage.getByRole("link", { name: "Admin Console" })).toBeVisible()

  // Confirm sign-out is actually reachable from here (not just present as markup) — clicking
  // through is what the old homepage-only UserButton could never exercise off the homepage.
  await adminPage.locator(".cl-userButtonTrigger").click()
  await adminPage.getByRole("button", { name: /Sign out$/i }).click()
  await expect(adminPage.getByRole("button", { name: /sign in/i })).toBeVisible()
})

test("VOLUNTEER and SHIFT_LEAD get global nav on the check-in landing page, without the Admin Console link", async ({
  volunteerPage,
  openAs
}) => {
  const shiftLeadPage = await openAs("shiftLead")

  await volunteerPage.goto("/")
  await expect(volunteerPage).toHaveURL(/\/checkin$/)
  await expect(volunteerPage.getByRole("navigation", { name: "Main" })).toBeVisible()
  await expect(volunteerPage.getByRole("link", { name: "Dashboard" })).toBeVisible()
  await expect(volunteerPage.getByRole("link", { name: "Admin Console" })).not.toBeVisible()
  await expect(volunteerPage.locator(".cl-userButtonTrigger")).toBeVisible()

  await shiftLeadPage.goto("/")
  await expect(shiftLeadPage).toHaveURL(/\/checkin$/)
  await expect(shiftLeadPage.getByRole("navigation", { name: "Main" })).toBeVisible()
  await expect(shiftLeadPage.getByRole("link", { name: "Admin Console" })).not.toBeVisible()
})

// KIOSK's stripped-down, nav-free landing page is intentional (see
// tests/e2e/kiosk-role-and-landing.spec.ts) — confirmed here too so this spec stands on its
// own as the "does the fix apply to the right roles" check.
test("KIOSK still gets no global nav on its own landing page", async ({ kioskPage }) => {
  await kioskPage.goto("/")
  await expect(kioskPage).toHaveURL(/\/feed-board$/)
  await expect(kioskPage.getByRole("navigation", { name: "Main" })).not.toBeVisible()
})

// This is the actual back-button scenario from BUGS.md: a signed-in volunteer navigates around
// the app and then hits browser back. The regression was a stale/inconsistent page (missing nav,
// or a Clerk "already signed in" error) rather than a clean return to wherever they came from.
test("browser back after navigating away from the check-in landing page returns cleanly, with nav intact", async ({
  volunteerPage
}) => {
  await volunteerPage.goto("/")
  await expect(volunteerPage).toHaveURL(/\/checkin$/)

  await volunteerPage.getByRole("link", { name: "Dashboard" }).click()
  await expect(volunteerPage).toHaveURL(/\/dashboard$/)
  await expect(volunteerPage.getByRole("heading", { name: "Daily Dashboard" })).toBeVisible()

  await volunteerPage.goBack()
  await expect(volunteerPage).toHaveURL(/\/checkin$/)
  await expect(volunteerPage.getByRole("heading", { name: /Check In/ })).toBeVisible()
  await expect(volunteerPage.getByRole("navigation", { name: "Main" })).toBeVisible()
  await expect(volunteerPage.locator(".cl-userButtonTrigger")).toBeVisible()
  await expect(volunteerPage.getByText(/already signed in/i)).not.toBeVisible()
})
