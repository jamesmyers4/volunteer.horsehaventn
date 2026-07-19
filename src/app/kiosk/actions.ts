"use server"

import { redirect } from "next/navigation"
import { performKioskToggle } from "@/lib/checkin"

// Deliberately no requireVolunteer()/requireRole() call — this is the whole point of the
// kiosk flow (V2.md Session 5): a shared tablet at the barn with no login on the device
// itself. The volunteer is identified purely by their checkInCode, same value whether it
// was scanned off a printed badge at the kiosk or off their own phone's QR code
// (src/app/checkin/code/page.tsx). Errors are caught here rather than left to throw, so a
// mistyped/unrecognized code shows a friendly kiosk message instead of Next's default error
// page on an unauthenticated, walk-up device.
export async function kioskToggle(formData: FormData) {
  const code = String(formData.get("code")).trim()

  let result: Awaited<ReturnType<typeof performKioskToggle>>
  try {
    result = await performKioskToggle(code)
  } catch {
    redirect("/kiosk?error=1")
  }

  const params = new URLSearchParams({
    result: result.action,
    name: result.volunteerName,
    at: result.at.toISOString()
  })
  redirect(`/kiosk?${params.toString()}`)
}
