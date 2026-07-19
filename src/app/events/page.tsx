import Link from "next/link"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isEligibleForEvent } from "@/lib/events"
import { createEvent } from "./actions"

export default async function EventsPage() {
  const volunteer = await requireVolunteer()
  const canCreate = volunteer.role === "ADMIN" || volunteer.canScheduleEvents

  const [events, categories, tags, thresholds, activeTagRows, otherVolunteers] = await Promise.all([
    prisma.event.findMany({
      where: { canceledAt: null },
      orderBy: { startAt: "asc" },
      include: { category: true, signups: { where: { status: { in: ["CONFIRMED", "WAITLISTED"] } } } }
    }),
    prisma.eventCategory.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.volunteerTag.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.tierThreshold.findMany(),
    prisma.volunteerTagAssignment.findMany({ where: { volunteerId: volunteer.id, removedAt: null }, select: { tagId: true } }),
    prisma.volunteer.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } })
  ])

  const activeTagIds = new Set(activeTagRows.map((r) => r.tagId))
  // Gated events an ineligible volunteer can't meet are hidden entirely (not just disabled) —
  // V2.md is explicit this is a visibility rule, not just a signup-time rejection.
  const visibleEvents = events.filter((event) =>
    isEligibleForEvent(volunteer, { requiredTagId: event.requiredTagId, requiredTier: event.requiredTier }, activeTagIds, thresholds)
  )

  const mySignupsByEvent = new Map(
    (await prisma.eventSignup.findMany({ where: { volunteerId: volunteer.id }, select: { eventId: true, status: true } })).map((s) => [
      s.eventId,
      s.status
    ])
  )

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">Events</h1>
      <p className="text-sm text-gray-500">Self-service signup. Gated events (e.g. the Blue Handler Class) only appear here once you meet their requirements.</p>

      <table className="w-full max-w-4xl text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Event</th>
            <th className="py-2">Category</th>
            <th className="py-2">When</th>
            <th className="py-2">Location</th>
            <th className="py-2">Signups</th>
            <th className="py-2">Your status</th>
          </tr>
        </thead>
        <tbody>
          {visibleEvents.map((event) => {
            const confirmedCount = event.signups.filter((s) => s.status === "CONFIRMED").length
            const waitlistedCount = event.signups.filter((s) => s.status === "WAITLISTED").length
            const myStatus = mySignupsByEvent.get(event.id)
            return (
              <tr key={event.id} className="border-b align-top">
                <td className="py-2">
                  <Link href={`/events/${event.id}`} className="font-medium underline">
                    {event.title}
                  </Link>
                </td>
                <td className="py-2">{event.category.name}</td>
                <td className="py-2">{event.startAt.toLocaleString()}</td>
                <td className="py-2">{event.locationText ?? "—"}</td>
                <td className="py-2">
                  {confirmedCount}
                  {event.capacity !== null ? ` / ${event.capacity}` : ""}
                  {waitlistedCount > 0 ? ` (+${waitlistedCount} waitlisted)` : ""}
                </td>
                <td className="py-2">{myStatus && myStatus !== "CANCELLED" ? myStatus : "—"}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {visibleEvents.length === 0 && <p className="text-sm text-gray-500">No upcoming events.</p>}

      {canCreate && (
        <form action={createEvent} className="flex w-full max-w-md flex-col gap-2 text-sm">
          <h2 className="text-sm font-semibold">Add event</h2>
          <input type="text" name="title" placeholder="title" required className="rounded border px-2 py-1" />
          <textarea name="description" placeholder="description (optional)" className="rounded border px-2 py-1" />
          <select name="categoryId" required defaultValue="" className="rounded border px-2 py-1">
            <option value="" disabled>
              category
            </option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            Start
            <input type="datetime-local" name="startAt" required className="rounded border px-2 py-1 text-sm text-black" />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            End
            <input type="datetime-local" name="endAt" required className="rounded border px-2 py-1 text-sm text-black" />
          </label>
          <input type="text" name="locationText" placeholder="location (optional, can be off-site)" className="rounded border px-2 py-1" />
          <input type="number" name="capacity" placeholder="capacity (blank = unlimited)" className="rounded border px-2 py-1" />
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            Required tag (optional)
            <select name="requiredTagId" defaultValue="" className="rounded border px-2 py-1 text-sm text-black">
              <option value="">None</option>
              {tags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            Required tier (optional)
            <select name="requiredTier" defaultValue="" className="rounded border px-2 py-1 text-sm text-black">
              <option value="">None</option>
              <option value="GREEN">Green</option>
              <option value="ORANGE">Orange</option>
              <option value="YELLOW">Yellow</option>
              <option value="BLUE">Blue</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            Watchers (optional — get organizer-level notifications alongside you)
            <select name="watcherIds" multiple className="h-24 rounded border px-2 py-1 text-sm text-black">
              {otherVolunteers.map((other) => (
                <option key={other.id} value={other.id}>
                  {other.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1 text-xs">
            <input type="checkbox" name="suppressSignupNotifications" />
            Suppress organizer notifications (your own confirmations still send to volunteers)
          </label>
          <button type="submit" className="w-fit rounded bg-black px-4 py-2 text-xs text-white">
            Add event
          </button>
        </form>
      )}
    </main>
  )
}
