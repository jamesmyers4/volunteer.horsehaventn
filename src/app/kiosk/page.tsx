import { kioskToggle } from "./actions"

// Deliberately no requireVolunteer() — this page is meant for a shared, unauthenticated
// tablet at the barn (V2.md Session 5's kiosk flow) as well as a volunteer's own phone
// after scanning their personal QR code (src/app/checkin/code/page.tsx links here with
// ?code=... pre-filled). A barcode scanner types the code like a keyboard and typically
// sends Enter, so the input is plain text, autofocused, inside a single-field form.
export default async function KioskPage({
  searchParams
}: {
  searchParams: Promise<{ code?: string; result?: string; name?: string; at?: string; error?: string }>
}) {
  const { code, result, name, at, error } = await searchParams

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-2xl font-semibold">Check In / Out</h1>
      <p className="max-w-sm text-sm text-gray-500">Scan your badge or enter your check-in code below.</p>

      {result && name && at && (
        <p className="rounded bg-green-100 px-6 py-4 text-lg text-green-800">
          {result === "checked-in" ? `Welcome, ${name}! Checked in at ${new Date(at).toLocaleTimeString()}.` : null}
          {result === "checked-out" ? `See you next time, ${name}! Checked out at ${new Date(at).toLocaleTimeString()}.` : null}
        </p>
      )}
      {error && <p className="rounded bg-red-100 px-6 py-4 text-lg text-red-800">Code not recognized — try again or ask a Shift Lead for help.</p>}

      <form action={kioskToggle} className="flex w-full max-w-xs flex-col gap-3">
        <input
          type="text"
          name="code"
          placeholder="Check-in code"
          defaultValue={code}
          required
          autoFocus
          autoComplete="off"
          className="rounded border px-3 py-3 text-center text-lg"
        />
        <button type="submit" className="rounded bg-black px-4 py-3 text-lg text-white">
          Check In / Out
        </button>
      </form>
    </main>
  )
}
