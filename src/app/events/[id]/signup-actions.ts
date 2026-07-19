"use server"

import { redirect } from "next/navigation"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { checkEventEligibility } from "@/lib/events"
import { sendEmail } from "@/lib/email"

type EventWithNotifyTargets = {
  id: string
  title: string
  startAt: Date
  suppressSignupNotifications: boolean
  createdBy: { email: string | null }
  watchers: { volunteer: { email: string | null } }[]
}

async function loadEventForNotify(eventId: string): Promise<EventWithNotifyTargets> {
  return prisma.event.findUniqueOrThrow({
    where: { id: eventId },
    include: { createdBy: { select: { email: true } }, watchers: { include: { volunteer: { select: { email: true } } } } }
  })
}

/**
 * Organizer-level notification (creator + watchers), skipped entirely when
 * suppressSignupNotifications is set. Separate from — and never gated by — the volunteer's
 * own confirmation email below (V2.md's explicit "always sends regardless of that flag").
 */
async function notifyOrganizers(event: EventWithNotifyTargets, message: string) {
  if (event.suppressSignupNotifications) return
  const recipients = [event.createdBy, ...event.watchers.map((w) => w.volunteer)]
  await Promise.all(
    recipients.filter((r): r is { email: string } => !!r.email).map((r) => sendEmail({ to: r.email, subject: `[${event.title}] Update`, text: message }))
  )
}

// Gating (src/lib/events.ts) is re-checked here even though the list page already hides
// gated events from ineligible volunteers — V2.md is explicit that a direct signup attempt
// must be rejected server-side too, not just hidden from listings.
export async function signupForEvent(eventId: string) {
  const volunteer = await requireVolunteer()
  const event = await prisma.event.findUniqueOrThrow({ where: { id: eventId } })
  if (event.canceledAt) throw new Error("This event has been canceled")

  const eligible = await checkEventEligibility(volunteer.id, { requiredTagId: event.requiredTagId, requiredTier: event.requiredTier })
  if (!eligible) throw new Error("Not eligible for this event")

  const existing = await prisma.eventSignup.findUnique({ where: { eventId_volunteerId: { eventId, volunteerId: volunteer.id } } })
  if (existing && existing.status !== "CANCELLED") throw new Error("Already signed up for this event")

  const confirmedCount = await prisma.eventSignup.count({ where: { eventId, status: "CONFIRMED" } })
  const status = event.capacity === null || confirmedCount < event.capacity ? "CONFIRMED" : "WAITLISTED"

  if (existing) {
    await prisma.eventSignup.update({ where: { id: existing.id }, data: { status, signedUpAt: new Date(), canceledAt: null } })
  } else {
    await prisma.eventSignup.create({ data: { eventId, volunteerId: volunteer.id, status } })
  }

  const eventWithTargets = await loadEventForNotify(eventId)
  const statusLabel = status === "CONFIRMED" ? "confirmed" : "waitlisted"
  await notifyOrganizers(eventWithTargets, `${volunteer.name} signed up for "${event.title}" (${statusLabel}).`)
  if (volunteer.email) {
    await sendEmail({
      to: volunteer.email,
      subject: `You're ${statusLabel} for ${event.title}`,
      text: `You're ${statusLabel} for "${event.title}" (${event.startAt.toDateString()}).`
    })
  }

  redirect(`/events/${eventId}`)
}

// Self-service only for MVP — a volunteer cancels their own signup. No admin-cancels-on-
// someone-else's-behalf path yet, matching the deliberate self-attestation scope cuts already
// made elsewhere in this project (CredentialRecord, training completion).
export async function cancelSignup(eventId: string) {
  const volunteer = await requireVolunteer()
  const signup = await prisma.eventSignup.findUniqueOrThrow({ where: { eventId_volunteerId: { eventId, volunteerId: volunteer.id } } })
  if (signup.status === "CANCELLED") throw new Error("Signup already canceled")

  const wasConfirmed = signup.status === "CONFIRMED"
  await prisma.eventSignup.update({ where: { id: signup.id }, data: { status: "CANCELLED", canceledAt: new Date() } })

  const event = await loadEventForNotify(eventId)
  await notifyOrganizers(event, `${volunteer.name} canceled their signup for "${event.title}".`)

  if (wasConfirmed) {
    const nextWaitlisted = await prisma.eventSignup.findFirst({ where: { eventId, status: "WAITLISTED" }, orderBy: { signedUpAt: "asc" } })
    if (nextWaitlisted) {
      const promoted = await prisma.eventSignup.update({
        where: { id: nextWaitlisted.id },
        data: { status: "CONFIRMED" },
        include: { volunteer: true }
      })
      await notifyOrganizers(event, `${promoted.volunteer.name} was promoted from the waitlist for "${event.title}".`)
      if (promoted.volunteer.email) {
        await sendEmail({
          to: promoted.volunteer.email,
          subject: `You're confirmed for ${event.title}`,
          text: `A spot opened up — you've been moved from the waitlist to confirmed for "${event.title}" (${event.startAt.toDateString()}).`
        })
      }
    }
  }

  redirect(`/events/${eventId}`)
}
