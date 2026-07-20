import Link from "next/link"
import { Show, SignInButton, UserButton } from "@clerk/nextjs"

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 p-8 text-center">
      <h1 className="text-2xl font-semibold">Horse Haven of Tennessee — Ops</h1>
      <p className="text-sm text-gray-500">Phase 1 scaffold. See CONTEXT.md and CLAUDE.md at the repo root before building on this.</p>
      <Show when="signed-out">
        <SignInButton mode="modal" />
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
