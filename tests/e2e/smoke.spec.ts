import { test, expect } from "@playwright/test"

test("homepage renders", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByRole("heading", { name: /Horse Haven of Tennessee/i })).toBeVisible()
})
