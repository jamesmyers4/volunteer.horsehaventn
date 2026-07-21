import Link from "next/link"
import { redirect } from "next/navigation"
import { Show, SignInButton, UserButton } from "@clerk/nextjs"
import { getCurrentVolunteer, landingRouteForRole } from "@/lib/auth"

// V4.md Session 1: role-based landing route after sign-in, replacing the flat link list below
// that every role used to see regardless of what they actually do first. Checked here (not
// just left to client-side Show) so a signed-in visitor never even renders the full nav —
// this is also the only "stripped-down layout" KIOSK needs, since this flat list is the only
// app-wide nav that exists anywhere in this codebase today.
export default async function Home() {
  const volunteer = await getCurrentVolunteer()
  if (volunteer) {
    const landingRoute = landingRouteForRole(volunteer.role)
    if (landingRoute) redirect(landingRoute)
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">Horse Haven of Tennessee — Ops</h1>
      <p className="text-sm text-gray-500">Phase 1 scaffold. See CONTEXT.md and CLAUDE.md at the repo root before building on this.</p>
      <Show when="signed-out">
        {/* forceRedirectUrl guarantees a real navigation to "/" once sign-in completes (even
            from the modal), so the redirect above actually runs — without it, a modal
            sign-in could leave a signed-in KIOSK/Volunteer/etc. sitting on this same flat
            link list with no server re-render to route it away. */}
        <SignInButton mode="modal" forceRedirectUrl="/" />
      </Show>
      <Show when="signed-in">
        <UserButton />
        <div className="flex gap-4">
          <Link href="/dashboard" className="text-sm underline">
            Dashboard
          </Link>
          <Link href="/checkin" className="text-sm underline">
            Check in
          </Link>
          <Link href="/checkin/roster" className="text-sm underline">
            Shift Roster
          </Link>
          <Link href="/animals" className="text-sm underline">
            Horses
          </Link>
          <Link href="/locations" className="text-sm underline">
            Locations
          </Link>
          <Link href="/intake-groups" className="text-sm underline">
            Intake Groups
          </Link>
          <Link href="/feed-board" className="text-sm underline">
            Feed Board
          </Link>
          <Link href="/facility-tasks" className="text-sm underline">
            Facility Tasks
          </Link>
          <Link href="/turnout-board" className="text-sm underline">
            Turnout Board
          </Link>
          <Link href="/volunteers" className="text-sm underline">
            Volunteers
          </Link>
          <Link href="/training" className="text-sm underline">
            Training
          </Link>
          <Link href="/tiers" className="text-sm underline">
            Tiers
          </Link>
          <Link href="/tags" className="text-sm underline">
            Tags
          </Link>
          <Link href="/events" className="text-sm underline">
            Events
          </Link>
          <Link href="/settings" className="text-sm underline">
            Settings
          </Link>
          <Link href="/kiosk" className="text-sm underline">
            Kiosk
          </Link>
          <Link href="/admin" className="text-sm underline">
            Admin Console
          </Link>
        </div>
      </Show>
    </main>
  )
}
