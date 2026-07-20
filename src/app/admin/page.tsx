import Link from "next/link"
import { requireRole } from "@/lib/auth"

// V2.md Session 7: replaces the diagnostic "am I admin" scaffold (CLAUDE.md's Repo Layout
// note already flagged this page as a stand-in, not a real dashboard) with the actual Admin
// Console home. Deliberately no new business logic — every link below either goes to a
// dedicated Admin Console screen for data that had no CRUD anywhere yet (Locations, Event
// Categories, Volunteers/user-management), or to the existing feature page that already
// carries full Admin-gated CRUD for that table (Tags, Training, Tiers, Settings) — see
// HANDOFF.md for why those weren't rebuilt here.
async function checkAccess() {
  try {
    await requireRole(["ADMIN"])
    return true
  } catch {
    return false
  }
}

export default async function AdminPage() {
  const authorized = await checkAccess()

  if (!authorized) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <h1 className="text-xl font-semibold">Not authorized</h1>
        <p className="text-sm text-gray-500">The Admin Console requires an ADMIN-role Volunteer record linked to your account.</p>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Admin Console</h1>
      <p className="text-sm text-gray-500">
        Central home for lookup/config tables and user management, restricted to ADMIN. Reduces reliance on a developer for routine data
        changes now that Sessions 1–6 have proven stable in real use.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Lookup &amp; config tables</h2>
        <ul className="flex flex-col gap-1 text-sm">
          <li>
            <Link href="/admin/locations" className="underline">
              Locations
            </Link>{" "}
            — fields, barn stalls, sick bay, arena (full create/edit/deactivate)
          </li>
          <li>
            <Link href="/admin/event-categories" className="underline">
              Event categories
            </Link>{" "}
            — the category picker used when scheduling an event
          </li>
          <li>
            <Link href="/tags" className="underline">
              Volunteer tags
            </Link>{" "}
            — Go Team and any future tags, plus the eligibility-candidates report
          </li>
          <li>
            <Link href="/training" className="underline">
              Training requirements
            </Link>{" "}
            — credential/compliance-training types
          </li>
          <li>
            <Link href="/tiers" className="underline">
              Tier thresholds
            </Link>{" "}
            — Green/Orange/Yellow/Blue tenure requirements
          </li>
          <li>
            <Link href="/settings" className="underline">
              Farm settings &amp; shift templates
            </Link>{" "}
            — active season, AM/PM reference times
          </li>
          <li>
            <Link href="/checklists" className="underline">
              End-of-shift checklist templates
            </Link>{" "}
            — the generic engine behind the shift leader&apos;s end-of-shift report
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">User management</h2>
        <ul className="flex flex-col gap-1 text-sm">
          <li>
            <Link href="/admin/volunteers" className="underline">
              Volunteers
            </Link>{" "}
            — change role, toggle event-scheduling permission, and jump to Blue release / tag assignment
          </li>
        </ul>
      </section>
    </main>
  )
}
