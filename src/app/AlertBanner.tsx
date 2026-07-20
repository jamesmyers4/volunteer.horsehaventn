import Link from "next/link"
import { getCurrentVolunteer } from "@/lib/auth"
import { getLiveAlerts } from "@/lib/alerts"

// V3.md Session 3: "live alerts... render as a banner across every authenticated view" —
// rendered from the root layout so it's unavoidable regardless of which page a volunteer
// lands on, rather than something every page has to remember to include. Renders nothing for
// an unauthenticated visitor (the homepage's own sign-in view) or once there's nothing live.
const SEVERITY_STYLES: Record<string, string> = {
  INFO: "border-blue-200 bg-blue-50 text-blue-900",
  WARNING: "border-amber-200 bg-amber-50 text-amber-900",
  URGENT: "border-red-300 bg-red-50 text-red-900"
}

export default async function AlertBanner() {
  const volunteer = await getCurrentVolunteer()
  if (!volunteer) return null

  const alerts = await getLiveAlerts(volunteer.id)
  if (alerts.length === 0) return null

  return (
    <div role="region" aria-label="Live alerts" className="flex flex-col">
      {alerts.map((alert) => (
        <Link
          key={alert.id}
          href={`/chat?channelId=${alert.channelId}`}
          className={`border-b px-4 py-2 text-sm ${SEVERITY_STYLES[alert.severity ?? "INFO"]}`}
        >
          <span className="font-semibold">{alert.channel.type === "BROADCAST" ? "Announcement" : `${alert.channel.name} alert`}:</span>{" "}
          {alert.body}
        </Link>
      ))}
    </div>
  )
}
