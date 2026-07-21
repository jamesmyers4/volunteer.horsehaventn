"use server"

import { redirect } from "next/navigation"
import { requireNonKioskVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type HandlingColorInput = "GREEN" | "ORANGE" | "YELLOW" | "BLUE" | "RED"

// Event is not ChangeLog-tracked — same reasoning as Location/lookup data (CONTEXT.md §4's
// legal-defensibility requirement doesn't reach scheduling/signup data). canScheduleEvents is
// independent of role (V2.md Session 4) — ADMIN can always create events regardless of the flag.
// EventCategory itself has no CRUD here — same deferral as Location's full CRUD (CLAUDE.md),
// left for Session 7's Admin Console; the seeded six categories cover Session 4's scope.
async function requireCanScheduleEvents() {
  const volunteer = await requireNonKioskVolunteer()
  if (volunteer.role !== "ADMIN" && !volunteer.canScheduleEvents) throw new Error("Not authorized")
  return volunteer
}

// Watchers are set at creation time only (V2.md's own wording) — no separate add/remove-
// watcher action exists today.
export async function createEvent(formData: FormData) {
  const actor = await requireCanScheduleEvents()

  const title = String(formData.get("title"))
  const descriptionRaw = formData.get("description")
  const categoryId = String(formData.get("categoryId"))
  const startAt = new Date(String(formData.get("startAt")))
  const endAt = new Date(String(formData.get("endAt")))
  const locationTextRaw = formData.get("locationText")
  const capacityRaw = formData.get("capacity")
  const requiredTagIdRaw = formData.get("requiredTagId")
  const requiredTierRaw = formData.get("requiredTier")
  const suppressSignupNotifications = formData.get("suppressSignupNotifications") === "on"
  const watcherIds = formData.getAll("watcherIds").map(String).filter(Boolean)

  if (endAt <= startAt) throw new Error("End time must be after start time")

  const event = await prisma.event.create({
    data: {
      title,
      description: descriptionRaw ? String(descriptionRaw) : undefined,
      categoryId,
      startAt,
      endAt,
      locationText: locationTextRaw ? String(locationTextRaw) : undefined,
      capacity: capacityRaw ? Number(capacityRaw) : undefined,
      createdById: actor.id,
      requiredTagId: requiredTagIdRaw ? String(requiredTagIdRaw) : undefined,
      requiredTier: requiredTierRaw ? (String(requiredTierRaw) as HandlingColorInput) : undefined,
      suppressSignupNotifications,
      watchers: watcherIds.length ? { create: watcherIds.map((volunteerId) => ({ volunteerId })) } : undefined
    }
  })

  redirect(`/events/${event.id}`)
}

// Editable by the event's own creator or an ADMIN — canScheduleEvents alone doesn't let one
// organizer edit another's event.
export async function updateEvent(eventId: string, formData: FormData) {
  const actor = await requireNonKioskVolunteer()
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
  if (actor.role !== "ADMIN" && actor.id !== event.createdById) throw new Error("Not authorized")

  const title = String(formData.get("title"))
  const descriptionRaw = formData.get("description")
  const categoryId = String(formData.get("categoryId"))
  const startAt = new Date(String(formData.get("startAt")))
  const endAt = new Date(String(formData.get("endAt")))
  const locationTextRaw = formData.get("locationText")
  const capacityRaw = formData.get("capacity")
  const requiredTagIdRaw = formData.get("requiredTagId")
  const requiredTierRaw = formData.get("requiredTier")
  const suppressSignupNotifications = formData.get("suppressSignupNotifications") === "on"

  if (endAt <= startAt) throw new Error("End time must be after start time")

  await prisma.event.update({
    where: { id: eventId },
    data: {
      title,
      description: descriptionRaw ? String(descriptionRaw) : null,
      categoryId,
      startAt,
      endAt,
      locationText: locationTextRaw ? String(locationTextRaw) : null,
      capacity: capacityRaw ? Number(capacityRaw) : null,
      requiredTagId: requiredTagIdRaw ? String(requiredTagIdRaw) : null,
      requiredTier: requiredTierRaw ? (String(requiredTierRaw) as HandlingColorInput) : null,
      suppressSignupNotifications
    }
  })

  redirect(`/events/${eventId}`)
}

export async function cancelEvent(eventId: string) {
  const actor = await requireNonKioskVolunteer()
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
  if (actor.role !== "ADMIN" && actor.id !== event.createdById) throw new Error("Not authorized")
  if (event.canceledAt) throw new Error("Event already canceled")

  await prisma.event.update({ where: { id: eventId }, data: { canceledAt: new Date() } })

  redirect(`/events/${eventId}`)
}
