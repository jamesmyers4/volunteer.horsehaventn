import QRCode from "qrcode"
import { headers } from "next/headers"
import { requireVolunteer } from "@/lib/auth"

// The "personal-phone QR flow" half of V2.md Session 5's checkInCode design — same code
// value as the kiosk badge, just presented as a scannable QR here. Scanning it opens
// /kiosk?code=... on the volunteer's own phone, pre-filled — tapping "Check In / Out" there
// does the same real-time toggle a kiosk tablet scan would. Generated server-side as inline
// SVG (no client JS, matching the rest of this app — see src/lib/checkin.ts's header note).
export default async function CheckInCodePage() {
  const volunteer = await requireVolunteer()

  const requestHeaders = await headers()
  const host = requestHeaders.get("host") ?? "localhost:3000"
  const protocol = host.startsWith("localhost") ? "http" : "https"
  const scanUrl = `${protocol}://${host}/kiosk?code=${encodeURIComponent(volunteer.checkInCode)}`

  const qrSvg = await QRCode.toString(scanUrl, { type: "svg", width: 220, margin: 1 })

  return (
    <main className="flex flex-1 flex-col items-center gap-4 p-8 text-center">
      <h1 className="text-xl font-semibold">My Check-In Code</h1>
      <p className="max-w-sm text-sm text-gray-500">
        Scan this with your phone&apos;s camera to check in or out instantly, or use the same code at the barn kiosk.
      </p>
      <div className="rounded border p-4" dangerouslySetInnerHTML={{ __html: qrSvg }} />
      <p className="font-mono text-sm text-gray-700">{volunteer.checkInCode}</p>
    </main>
  )
}
