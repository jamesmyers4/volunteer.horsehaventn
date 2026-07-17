import { auth } from "@clerk/nextjs/server"
import { vi } from "vitest"

/** Simulates a signed-in Clerk session for the given Clerk user id. */
export function mockSignedInAs(clerkId: string) {
  vi.mocked(auth).mockResolvedValue({ isAuthenticated: true, userId: clerkId } as Awaited<ReturnType<typeof auth>>)
}

/** Simulates no active Clerk session (the default, but useful to reset explicitly mid-test). */
export function mockSignedOut() {
  vi.mocked(auth).mockResolvedValue({ isAuthenticated: false, userId: null } as Awaited<ReturnType<typeof auth>>)
}
