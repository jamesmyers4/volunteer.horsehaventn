import { test as base, expect, type Page, type BrowserContext } from "@playwright/test"
import { clerk } from "@clerk/testing/playwright"
import { TEST_USERS, type TestRole } from "./test-users"
import { resetTransactionalData } from "./helpers/db"

type Fixtures = {
  adminPage: Page
  shiftLeadPage: Page
  volunteerPage: Page
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

// Every test starts from a clean slate (lookups + the seeded E2E volunteers survive) so
// specs never depend on execution order or leftover data from an earlier test.
base.beforeEach(async () => {
  await resetTransactionalData()
})

export const test = base.extend<Fixtures>({
  adminPage: async ({ page }, use) => {
    await use(await signIn(page, TEST_USERS.admin.email))
  },
  shiftLeadPage: async ({ page }, use) => {
    await use(await signIn(page, TEST_USERS.shiftLead.email))
  },
  volunteerPage: async ({ page }, use) => {
    await use(await signIn(page, TEST_USERS.volunteer.email))
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
