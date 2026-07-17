export type TestRole = "admin" | "shiftLead" | "volunteer"

type ClerkAppRole = "ADMIN" | "SHIFT_LEAD" | "VOLUNTEER"

// Fixed, namespaced test users reused across E2E runs (find-or-create in global-setup.ts,
// never torn down) — signed in via Clerk's ticket-based email sign-in, no password needed.
// Their matching Volunteer rows are (re)seeded every run so role always matches this table.
export const TEST_USERS: Record<TestRole, { email: string; name: string; role: ClerkAppRole }> = {
  admin: { email: "e2e-admin@volunteer-ops.test", name: "E2E Admin", role: "ADMIN" },
  shiftLead: { email: "e2e-shiftlead@volunteer-ops.test", name: "E2E Shift Lead", role: "SHIFT_LEAD" },
  volunteer: { email: "e2e-volunteer@volunteer-ops.test", name: "E2E Volunteer", role: "VOLUNTEER" }
}
