import { test, expect } from "./fixtures"

test("homepage shows sign-in for a signed-out visitor", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: /Horse Haven of Tennessee/i })).toBeVisible()
  await expect(page.getByRole("button", { name: /sign in/i })).toBeVisible()
  await expect(page.getByRole("link", { name: "Dashboard" })).not.toBeVisible()
})

test("signed-in volunteer sees the main nav", async ({ volunteerPage }) => {
  await expect(volunteerPage.getByRole("link", { name: "Dashboard" })).toBeVisible()
  await expect(volunteerPage.getByRole("link", { name: "Check in" })).toBeVisible()
  await expect(volunteerPage.getByRole("link", { name: "Horses" })).toBeVisible()
  await expect(volunteerPage.getByRole("link", { name: "Locations" })).toBeVisible()
})

test("admin check page confirms role for an Admin and rejects a Volunteer", async ({ adminPage, openAs }) => {
  await adminPage.goto("/admin")
  await expect(adminPage.getByText("Admin access confirmed")).toBeVisible()
  await expect(adminPage.getByText(/ADMIN/)).toBeVisible()

  // adminPage and volunteerPage would otherwise fight over the same underlying `page`
  // fixture (Playwright caches it once per test) — the second signIn() call would fail
  // with "You're already signed in" since the first fixture already authenticated it as
  // Admin. openAs() opens an independent browser context for the second actor instead.
  const volunteerPage = await openAs("volunteer")
  await volunteerPage.goto("/admin")
  await expect(volunteerPage.getByText("Not authorized")).toBeVisible()
})
