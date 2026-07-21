import { auth } from "@clerk/nextjs/server"
import { prisma } from "./prisma"

export type Role = "ADMIN" | "SHIFT_LEAD" | "VOLUNTEER" | "GUEST" | "KIOSK"

export async function getCurrentVolunteer() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated || !userId) return null
  return prisma.volunteer.findUnique({ where: { clerkId: userId } })
}

export async function requireVolunteer() {
  const volunteer = await getCurrentVolunteer()
  if (!volunteer) throw new Error("Not authenticated")
  return volunteer
}

export async function requireRole(allowed: Role[]) {
  const volunteer = await requireVolunteer()
  if (!allowed.includes(volunteer.role)) throw new Error("Not authorized")
  return volunteer
}

// V4.md Session 1: KIOSK is a shared, always-logged-in, genuinely read-only display account —
// it must fail every write-capable action application-wide, not just the ones gated by a
// specific requireRole([...]) allowlist. A number of self-service actions (check-in, chat,
// event signup, training self-attestation, photo upload, facility-task logging) were written
// before KIOSK existed and gate only on requireVolunteer() — "any signed-in person" — which is
// exactly the kind of implicit allow-all a new role can slip through unnoticed, the same
// failure mode as a denylist. Every such action calls this instead now, so a future
// self-service action that reaches for "just require someone signed in" doesn't have to
// separately remember to exclude KIOSK either.
export async function requireNonKioskVolunteer() {
  const volunteer = await requireVolunteer()
  if (volunteer.role === "KIOSK") throw new Error("Not authorized")
  return volunteer
}

// V4.md Session 1: where each role lands immediately after sign-in, replacing the flat
// homepage link list every role used to see regardless of what they actually do first. Null
// means "no redirect" — GUEST isn't named in V4.md's landing-route table (only KIOSK/
// VOLUNTEER/SHIFT_LEAD/ADMIN are), so it's left on the homepage rather than guessing a
// destination for a role this session doesn't cover. This only changes the default landing
// spot — every page's own permission check remains the real authorization boundary.
export function landingRouteForRole(role: Role): string | null {
  switch (role) {
    case "KIOSK":
      return "/feed-board"
    case "VOLUNTEER":
    case "SHIFT_LEAD":
      return "/checkin"
    case "ADMIN":
      return "/admin"
    default:
      return null
  }
}
