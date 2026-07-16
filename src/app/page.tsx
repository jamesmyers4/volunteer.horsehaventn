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
          <Link href="/checkin" className="text-sm underline">
            Check in
          </Link>
          <Link href="/horses" className="text-sm underline">
            Horses
          </Link>
          <Link href="/admin" className="text-sm underline">
            Admin check
          </Link>
        </div>
      </Show>
    </main>
  )
}
