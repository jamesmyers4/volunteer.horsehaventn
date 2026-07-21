export type TestRole = "admin" | "shiftLead" | "volunteer" | "kiosk"

type ClerkAppRole = "ADMIN" | "SHIFT_LEAD" | "VOLUNTEER" | "KIOSK"

// Fixed, namespaced test users reused across E2E runs (find-or-create in global-setup.ts,
// never torn down) — signed in via Clerk's ticket-based email sign-in, no password needed.
// Their matching Volunteer rows are (re)seeded every run so role always matches this table.
export const TEST_USERS: Record<TestRole, { email: string; name: string; role: ClerkAppRole }> = {
  // Clerk's live API rejects the RFC 2606 `.test` TLD as an invalid email format (422,
  // form_param_format_invalid) even though it's the conventional reserved domain for this
  // exact purpose — confirmed by direct API probe. `.example.com` is also RFC 2606 reserved
  // (guaranteed non-deliverable, never a real signup) and Clerk accepts it.
  admin: { email: "e2e-admin@volunteer-ops.example.com", name: "E2E Admin", role: "ADMIN" },
  shiftLead: { email: "e2e-shiftlead@volunteer-ops.example.com", name: "E2E Shift Lead", role: "SHIFT_LEAD" },
  volunteer: { email: "e2e-volunteer@volunteer-ops.example.com", name: "E2E Volunteer", role: "VOLUNTEER" },
  // V4.md Session 1: the shared, always-logged-in, read-only barn TV account. A real test
  // user rather than a fixture-only role, same as the other three, so it goes through the
  // exact same Clerk ticket sign-in path a real KIOSK login would.
  kiosk: { email: "e2e-kiosk@volunteer-ops.example.com", name: "E2E Kiosk", role: "KIOSK" }
}
