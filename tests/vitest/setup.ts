import { vi, beforeEach } from "vitest"
import { RedirectSignal, NotFoundSignal } from "./helpers/signals"
import { resetDb } from "./helpers/db"

// Every Server Action calls requireVolunteer()/requireRole() -> auth() from this module.
// Real Clerk sign-in isn't available (or wanted) in Vitest — that's what the Playwright
// suite's Clerk-authenticated fixtures cover. Here, each test sets the mocked return value
// via helpers/auth-mock.ts to simulate "signed in as this Clerk user."
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(async () => ({ isAuthenticated: false, userId: null }))
}))

// redirect()/notFound() throw internally even outside a real request (that's how Next's
// App Router router uses them), but relying on the exact shape of that internal error is
// fragile across versions — swap in a small typed signal instead.
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectSignal(url)
  }),
  notFound: vi.fn(() => {
    throw new NotFoundSignal()
  })
}))

beforeEach(async () => {
  await resetDb()
})
