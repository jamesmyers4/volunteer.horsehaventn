import { defineConfig, devices } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/e2e",
  // Every test signs in as one of a handful of shared Clerk test users (see fixtures.ts) and
  // shares one Postgres test DB — parallel workers would race on both, so run serially.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  globalSetup: "./tests/e2e/global-setup.ts",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry"
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } }
  ],
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    // Never reuse an already-running server, even locally — `npm run dev` running against
    // the real Neon DB must never get mistaken for the E2E server, which needs to be the
    // one bound to DATABASE_URL from .env.test. Always start fresh, bound to the test DB.
    reuseExistingServer: false
  }
})
