import { test as base, expect, type Page, type BrowserContext } from "@playwright/test"
import { clerk } from "@clerk/testing/playwright"
import { TEST_USERS, type TestRole } from "./test-users"
import { resetTransactionalData } from "./helpers/db"

type Fixtures = {
  resetDb: void
  adminPage: Page
  shiftLeadPage: Page
  volunteerPage: Page
  kioskPage: Page
  /**
   * Opens a fresh, independently-signed-in page for tests that need two roles active at
   * once (e.g. an Admin sets something up, then a Shift Lead acts on it) — a single Page
   * only ever holds one Clerk session, so multi-actor tests need separate browser contexts.
   */
  openAs: (role: TestRole) => Promise<Page>
}

async function signIn(page: Page, email: string) {
  // clerk.signIn requires a page that has already loaded Clerk once before it's called.
  await page.goto("/")
  await clerk.signIn({ page, emailAddress: email })
  await page.goto("/")
  return page
}

export const test = base.extend<Fixtures>({
  // Every test starts from a clean slate (lookups + the seeded E2E volunteers survive) so
  // specs never depend on execution order or leftover data from an earlier test. This has
  // to be a fixture (not a bare `base.beforeEach()` call at module scope) — Playwright only
  // evaluates this file once per worker process, so a plain beforeEach only ends up attached
  // to whichever spec file happens to trigger that first import in a given worker; every
  // other file sharing the worker silently runs with no reset at all. Auto fixtures don't
  // have that problem — they're resolved per-test through Playwright's fixture graph, not a
  // one-time side effect of module evaluation. (Confirmed via reset-trace.log instrumentation:
  // the old beforeEach fired for exactly one file per worker and silently skipped the rest.)
  resetDb: [
    async ({}, use) => {
      await resetTransactionalData()
      await use()
    },
    { auto: true }
  ],
  adminPage: async ({ page }, use) => {
    await use(await signIn(page, TEST_USERS.admin.email))
  },
  shiftLeadPage: async ({ page }, use) => {
    await use(await signIn(page, TEST_USERS.shiftLead.email))
  },
  volunteerPage: async ({ page }, use) => {
    await use(await signIn(page, TEST_USERS.volunteer.email))
  },
  kioskPage: async ({ page }, use) => {
    await use(await signIn(page, TEST_USERS.kiosk.email))
  },
  openAs: async ({ browser }, use) => {
    const contexts: BrowserContext[] = []
    const open = async (role: TestRole) => {
      const context = await browser.newContext()
      contexts.push(context)
      return signIn(await context.newPage(), TEST_USERS[role].email)
    }
    await use(open)
    await Promise.all(contexts.map((c) => c.close()))
  }
})

export { expect }
