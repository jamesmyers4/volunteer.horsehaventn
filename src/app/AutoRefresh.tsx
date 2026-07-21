"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// V4.md Session 2: an always-on kiosk screen (Feed Board / Turnout Board) needs to reflect
// same-day changes and flip its AM/PM display across the noon boundary without a manual
// reload. router.refresh() re-runs the current route's server components against the same
// URL (so a ?shift=/?period= override in the query string survives the refresh) rather than
// forcing a full page reload. A timed interval is unavoidably client-side — this is the
// second, narrow, spec-required exception to this codebase's zero-client-component
// convention, same category as HeadshotCropUpload.tsx's first one.
const DEFAULT_INTERVAL_MS = 30 * 60 * 1000

export default function AutoRefresh({ intervalMs = DEFAULT_INTERVAL_MS }: { intervalMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])

  return null
}
