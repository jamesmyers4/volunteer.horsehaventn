import { notFound } from "next/navigation"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { isEligibleForEvent } from "@/lib/events"
import { updateEvent, cancelEvent } from "../actions"
import { signupForEvent, cancelSignup } from "./signup-actions"

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const volunteer = await requireVolunteer()
  const { id } = await params

  const [event, categories, tags, thresholds, activeTagRows] = await Promise.all([
    prisma.event.findUnique({
      where: { id },
      include: {
        category: true,
        createdBy: true,
        watchers: { include: { volunteer: true } },
        signups: { where: { status: { in: ["CONFIRMED", "WAITLISTED"] } }, include: { volunteer: true }, orderBy: { signedUpAt: "asc" } },
        requiredTag: true
      }
    }),
    prisma.eventCategory.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.volunteerTag.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.tierThreshold.findMany(),
    prisma.volunteerTagAssignment.findMany({ where: { volunteerId: volunteer.id, removedAt: null }, select: { tagId: true } })
  ])

  if (!event) notFound()

  const activeTagIds = new Set(activeTagRows.map((r) => r.tagId))
  const eligible = isEligibleForEvent(volunteer, { requiredTagId: event.requiredTagId, requiredTier: event.requiredTier }, activeTagIds, thresholds)

  const mySignup = await prisma.eventSignup.findUnique({ where: { eventId_volunteerId: { eventId: id, volunteerId: volunteer.id } } })
  const isActiveSignup = mySignup && mySignup.status !== "CANCELLED"

  const canManage = volunteer.role === "ADMIN" || volunteer.id === event.createdById
  const confirmed = event.signups.filter((s) => s.status === "CONFIRMED")
  const waitlisted = event.signups.filter((s) => s.status === "WAITLISTED")

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">
        {event.title}
        {event.canceledAt && <span className="ml-2 text-sm font-normal text-red-600">(canceled)</span>}
      </h1>

      <dl className="grid max-w-md grid-cols-2 gap-x-4 gap-y-1 text-sm">
        <dt className="text-gray-500">Category</dt>
        <dd>{event.category.name}</dd>
        <dt className="text-gray-500">When</dt>
        <dd>
          {event.startAt.toLocaleString()} – {event.endAt.toLocaleString()}
        </dd>
        <dt className="text-gray-500">Location</dt>
        <dd>{event.locationText ?? "—"}</dd>
        <dt className="text-gray-500">Capacity</dt>
        <dd>
          {confirmed.length}
          {event.capacity !== null ? ` / ${event.capacity}` : " (unlimited)"}
        </dd>
        <dt className="text-gray-500">Organizer</dt>
        <dd>{event.createdBy.name}</dd>
        {event.requiredTag && (
          <>
            <dt className="text-gray-500">Requires tag</dt>
            <dd>{event.requiredTag.name}</dd>
          </>
        )}
        {event.requiredTier && (
          <>
            <dt className="text-gray-500">Requires tier</dt>
            <dd>{event.requiredTier}+</dd>
          </>
        )}
      </dl>
      {event.description && <p className="max-w-md text-sm">{event.description}</p>}

      {!event.canceledAt && (
        <section className="flex flex-col gap-2">
          {isActiveSignup ? (
            <>
              <p className="text-sm">Your status: {mySignup!.status}</p>
              <form action={cancelSignup.bind(null, event.id)}>
                <button type="submit" className="w-fit rounded border px-3 py-1.5 text-xs">
                  Cancel my signup
                </button>
              </form>
            </>
          ) : eligible ? (
            <form action={signupForEvent.bind(null, event.id)}>
              <button type="submit" className="w-fit rounded bg-black px-4 py-2 text-xs text-white">
                Sign up
              </button>
            </form>
          ) : (
            <p className="text-sm text-gray-500">You don&apos;t meet the requirements for this event.</p>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Roster</h2>
        <div className="flex flex-col gap-1 text-sm">
          <p className="text-xs font-semibold text-gray-500">Confirmed ({confirmed.length})</p>
          {confirmed.length === 0 ? (
            <p className="text-gray-500">None yet.</p>
          ) : (
            <ul>
              {confirmed.map((s) => (
                <li key={s.id}>{s.volunteer.name}</li>
              ))}
            </ul>
          )}
          {waitlisted.length > 0 && (
            <>
              <p className="mt-2 text-xs font-semibold text-gray-500">Waitlisted ({waitlisted.length})</p>
              <ul>
                {waitlisted.map((s) => (
                  <li key={s.id}>{s.volunteer.name}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>

      {canManage && !event.canceledAt && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Manage event</h2>
          <form action={updateEvent.bind(null, event.id)} className="flex w-full max-w-md flex-col gap-2 text-sm">
            <input type="text" name="title" defaultValue={event.title} required className="rounded border px-2 py-1" />
            <textarea name="description" defaultValue={event.description ?? ""} className="rounded border px-2 py-1" />
            <select name="categoryId" defaultValue={event.categoryId} required className="rounded border px-2 py-1">
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              Start
              <input
                type="datetime-local"
                name="startAt"
                defaultValue={toLocalInputValue(event.startAt)}
                required
                className="rounded border px-2 py-1 text-sm text-black"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              End
              <input
                type="datetime-local"
                name="endAt"
                defaultValue={toLocalInputValue(event.endAt)}
                required
                className="rounded border px-2 py-1 text-sm text-black"
              />
            </label>
            <input type="text" name="locationText" defaultValue={event.locationText ?? ""} className="rounded border px-2 py-1" />
            <input type="number" name="capacity" defaultValue={event.capacity ?? ""} className="rounded border px-2 py-1" />
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              Required tag
              <select name="requiredTagId" defaultValue={event.requiredTagId ?? ""} className="rounded border px-2 py-1 text-sm text-black">
                <option value="">None</option>
                {tags.map((tag) => (
                  <option key={tag.id} value={tag.id}>
                    {tag.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-gray-500">
              Required tier
              <select name="requiredTier" defaultValue={event.requiredTier ?? ""} className="rounded border px-2 py-1 text-sm text-black">
                <option value="">None</option>
                <option value="GREEN">Green</option>
                <option value="ORANGE">Orange</option>
                <option value="YELLOW">Yellow</option>
                <option value="BLUE">Blue</option>
              </select>
            </label>
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" name="suppressSignupNotifications" defaultChecked={event.suppressSignupNotifications} />
              Suppress organizer notifications
            </label>
            <button type="submit" className="w-fit rounded border px-3 py-1.5 text-xs">
              Save changes
            </button>
          </form>
          <form action={cancelEvent.bind(null, event.id)}>
            <button type="submit" className="w-fit rounded border border-red-600 px-3 py-1.5 text-xs text-red-600">
              Cancel event
            </button>
          </form>
        </section>
      )}
    </main>
  )
}

function toLocalInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}
