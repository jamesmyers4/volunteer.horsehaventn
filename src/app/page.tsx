import { redirect } from "next/navigation"
import { Show, SignInButton } from "@clerk/nextjs"
import { getCurrentVolunteer, landingRouteForRole } from "@/lib/auth"

// V4.md Session 1: role-based landing route after sign-in — ADMIN/VOLUNTEER/SHIFT_LEAD/KIOSK
// never see this page's body at all past their first sign-in. GUEST is the one role with no
// landing route (see landingRouteForRole), so it's the only signed-in role that actually lands
// here. Nav + sign-out are handled globally by src/app/NavBar.tsx (rendered from the root
// layout) — this page no longer duplicates that list (see BUGS.md: the duplicate list here used
// to be the *only* nav in the app, which is what left every non-homepage page with no way to
// navigate elsewhere or sign out once V4.md's redirect started sending people past this page).
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
        <p className="text-sm text-gray-500">Signed in. Use the nav above to get around.</p>
      </Show>
    </main>
  )
}
