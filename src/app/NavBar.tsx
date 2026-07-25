import Link from "next/link"
import { UserButton } from "@clerk/nextjs"
import { getCurrentVolunteer } from "@/lib/auth"

// BUGS.md: the homepage's flat link list (removed from page.tsx as part of this fix) was the
// only app-wide nav in this codebase. That was fine while everyone landed on the homepage, but
// V4.md Session 1's role-based landing redirect (src/lib/auth.ts's landingRouteForRole) sends
// every non-GUEST role straight past it to /admin, /checkin, or /feed-board — leaving those
// pages with no way to navigate elsewhere and, worse, no sign-out control at all. Rendered once
// from the root layout (same pattern as AlertBanner.tsx) so every page gets it regardless of
// which route redirected there. Renders nothing for a signed-out visitor (homepage owns that
// view) and nothing for KIOSK — KIOSK's stripped-down, nav-free layout is intentional (V4.md
// Session 1, covered by tests/e2e/kiosk-role-and-landing.spec.ts), not the bug being fixed here.
const LINKS: Array<{ href: string; label: string }> = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/checkin", label: "Check in" },
  { href: "/checkin/roster", label: "Shift Roster" },
  { href: "/animals", label: "Horses" },
  { href: "/locations", label: "Locations" },
  { href: "/intake-groups", label: "Intake Groups" },
  { href: "/feed-board", label: "Feed Board" },
  { href: "/facility-tasks", label: "Facility Tasks" },
  { href: "/turnout-board", label: "Turnout Board" },
  { href: "/volunteers", label: "Volunteers" },
  { href: "/training", label: "Training" },
  { href: "/tiers", label: "Tiers" },
  { href: "/tags", label: "Tags" },
  { href: "/events", label: "Events" },
  { href: "/chat", label: "Chat" },
  { href: "/settings", label: "Settings" }
]

export default async function NavBar() {
  const volunteer = await getCurrentVolunteer()
  if (!volunteer || volunteer.role === "KIOSK") return null

  return (
    <nav aria-label="Main" className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b bg-white px-4 py-2">
      <Link href="/" className="text-sm font-semibold">
        Horse Haven Ops
      </Link>
      {LINKS.map((link) => (
        <Link key={link.href} href={link.href} className="text-sm underline">
          {link.label}
        </Link>
      ))}
      {volunteer.role === "ADMIN" && (
        <Link href="/admin" className="text-sm underline">
          Admin Console
        </Link>
      )}
      <div className="ml-auto flex items-center">
        <UserButton />
      </div>
    </nav>
  )
}
