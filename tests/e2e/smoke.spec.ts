import { test, expect } from "./fixtures"

test("homepage shows sign-in for a signed-out visitor", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: /Horse Haven of Tennessee/i })).toBeVisible()
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible()
  await expect(page.getByRole("link", { name: "Dashboard" })).not.toBeVisible()
})

// V4.md Session 1: a signed-in Volunteer now lands on /checkin, not this flat link list — see
// tests/e2e/kiosk-role-and-landing.spec.ts for the full per-role landing-route coverage. This
// smoke test only confirms the homepage itself no longer stops a signed-in Volunteer.
// BUGS.md fix: the redirect now lands on a page with its own global nav (src/app/NavBar.tsx),
// not a dead end — Dashboard is expected to be visible there (any signed-in volunteer can read
// it), see tests/e2e/navigation.spec.ts for the full nav+sign-out coverage this fix added.
test("signed-in volunteer is redirected off the homepage to the check-in page", async ({ volunteerPage }) => {
  await volunteerPage.goto("/")
  await expect(volunteerPage).toHaveURL(/\/checkin$/)
  await expect(volunteerPage.getByRole("link", { name: "Dashboard" })).toBeVisible()
})

// V2.md Session 7 replaced the diagnostic "am I admin" scaffold with the real Admin Console
// home (see tests/e2e/admin.spec.ts for full route-protection and CRUD coverage) — this smoke
// test only checks the basic admin-vs-non-admin split still holds for the top-level route.
test("admin console home confirms access for an Admin and rejects a Volunteer", async ({ adminPage, openAs }) => {
  await adminPage.goto("/admin")
  await expect(adminPage.getByRole("heading", { name: "Admin Console" })).toBeVisible()

  // adminPage and volunteerPage would otherwise fight over the same underlying `page`
  // fixture (Playwright caches it once per test) — the second signIn() call would fail
  // with "You're already signed in" since the first fixture already authenticated it as
  // Admin. openAs() opens an independent browser context for the second actor instead.
  const volunteerPage = await openAs("volunteer")
  await volunteerPage.goto("/admin")
  await expect(volunteerPage.getByText("Not authorized")).toBeVisible()
})
