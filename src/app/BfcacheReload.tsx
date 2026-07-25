"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"

// BUGS.md: browser back can restore a page from the browser's back/forward cache (bfcache) —
// a frozen pre-navigation snapshot — without re-running any server component, so the DOM on
// screen can disagree with the live Clerk session (e.g. a stale signed-out snapshot of "/"
// still showing SignInButton after the visitor has since signed in). Clicking a Clerk sign-in
// control while already authenticated is what throws Clerk's "already signed in" error. The
// `pageshow` event's `persisted` flag is the one reliable cross-browser signal a page came from
// bfcache rather than a fresh load; forcing a router refresh re-runs server components (and
// this app's own auth-based redirects) against the current session instead of leaving the
// stale snapshot on screen.
export default function BfcacheReload() {
  const router = useRouter()

  useEffect(() => {
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        router.refresh()
      }
    }
    window.addEventListener("pageshow", handlePageShow)
    return () => window.removeEventListener("pageshow", handlePageShow)
  }, [router])

  return null
}
