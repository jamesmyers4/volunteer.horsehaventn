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

// revalidatePath() (src/app/chat/actions.ts) also requires a real Next.js request-scoped
// "static generation store" that doesn't exist when a Server Action is called directly from
// a plain Vitest test — same category as redirect()/notFound() above, a Next.js runtime
// primitive to stub at the boundary rather than business logic to exercise for real here.
vi.mock("next/cache", () => ({
  revalidatePath: vi.fn()
}))

beforeEach(async () => {
  await resetDb()
})
