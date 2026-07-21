import { randomUUID } from "node:crypto"
import { describe, it, expect, vi, beforeEach } from "vitest"

const sendEmailMock = vi.hoisted(() => vi.fn<(params: { to: string; subject: string; text: string }) => Promise<void>>(async () => {}))
vi.mock("@/lib/email", () => ({ sendEmail: sendEmailMock }))

import { createEvent, updateEvent, cancelEvent } from "@/app/events/actions"
import { signupForEvent, cancelSignup } from "@/app/events/[id]/signup-actions"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs } from "../helpers/auth-mock"
import { createVolunteer, createEvent as createEventRow, getEventCategory, getVolunteerTag } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

const unique = () => randomUUID().slice(0, 8)

function baseEventFields(overrides: Record<string, string> = {}) {
  const start = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000)
  return {
    title: `Test Event ${unique()}`,
    startAt: start.toISOString().slice(0, 16),
    endAt: end.toISOString().slice(0, 16),
    ...overrides
  }
}

beforeEach(() => {
  sendEmailMock.mockClear()
})

describe("createEvent", () => {
  it("is rejected for a plain volunteer without canScheduleEvents", async () => {
    await createVolunteer({ clerkId: "clerk_vol_ce", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_ce")
    const category = await getEventCategory()

    await expect(createEvent(formData({ ...baseEventFields(), categoryId: category.id }))).rejects.toThrow("Not authorized")
  })

  // V4.md Session 1 defense-in-depth: even if a KIOSK account somehow had canScheduleEvents
  // toggled on, it must still be rejected — requireCanScheduleEvents now calls
  // requireNonKioskVolunteer() before checking the flag at all.
  it("rejects a KIOSK-role account even with canScheduleEvents = true", async () => {
    await prisma.volunteer.create({
      data: { clerkId: "clerk_kiosk_ce", name: "Lobby TV", role: "KIOSK", status: "ACTIVE", tier: "GREEN", canScheduleEvents: true }
    })
    mockSignedInAs("clerk_kiosk_ce")
    const category = await getEventCategory()

    await expect(createEvent(formData({ ...baseEventFields(), categoryId: category.id }))).rejects.toThrow("Not authorized")
  })

  it("succeeds for a volunteer with canScheduleEvents = true, even without ADMIN role", async () => {
    await prisma.volunteer.create({
      data: { clerkId: "clerk_sched_ce", name: "Scheduler", role: "VOLUNTEER", status: "ACTIVE", tier: "GREEN", canScheduleEvents: true }
    })
    mockSignedInAs("clerk_sched_ce")
    const category = await getEventCategory()
    const fields = baseEventFields()

    const url = await captureRedirect(() => createEvent(formData({ ...fields, categoryId: category.id })))

    const event = await prisma.event.findFirstOrThrow({ where: { title: fields.title } })
    expect(url).toBe(`/events/${event.id}`)
  })

  it("succeeds for an ADMIN regardless of canScheduleEvents", async () => {
    const admin = await createVolunteer({ clerkId: "clerk_admin_ce", role: "ADMIN" })
    mockSignedInAs("clerk_admin_ce")
    const category = await getEventCategory()
    const fields = baseEventFields()

    await captureRedirect(() => createEvent(formData({ ...fields, categoryId: category.id })))

    const event = await prisma.event.findFirstOrThrow({ where: { title: fields.title } })
    expect(event.createdById).toBe(admin.id)
  })

  it("rejects an end time at or before the start time", async () => {
    await createVolunteer({ clerkId: "clerk_admin_bad_time", role: "ADMIN" })
    mockSignedInAs("clerk_admin_bad_time")
    const category = await getEventCategory()
    const start = new Date(Date.now() + 60 * 60 * 1000)

    await expect(
      createEvent(
        formData({
          title: `Test Event ${unique()}`,
          categoryId: category.id,
          startAt: start.toISOString().slice(0, 16),
          endAt: start.toISOString().slice(0, 16)
        })
      )
    ).rejects.toThrow("End time must be after start time")
  })

  it("creates watchers at creation time", async () => {
    await createVolunteer({ clerkId: "clerk_admin_watch", role: "ADMIN" })
    mockSignedInAs("clerk_admin_watch")
    const watcher = await createVolunteer({ role: "VOLUNTEER" })
    const category = await getEventCategory()
    const fields = baseEventFields()
    const fd = formData({ ...fields, categoryId: category.id })
    fd.append("watcherIds", watcher.id)

    await captureRedirect(() => createEvent(fd))

    const event = await prisma.event.findFirstOrThrow({ where: { title: fields.title }, include: { watchers: true } })
    expect(event.watchers.map((w) => w.volunteerId)).toEqual([watcher.id])
  })
})

describe("updateEvent / cancelEvent", () => {
  // V4.md Session 1 defense-in-depth: updateEvent/cancelEvent now call
  // requireNonKioskVolunteer() before the creator/ADMIN check even runs.
  it("updateEvent rejects a KIOSK-role account, even for a garbage eventId", async () => {
    await createVolunteer({ clerkId: "clerk_kiosk_ue", role: "KIOSK" })
    mockSignedInAs("clerk_kiosk_ue")

    await expect(updateEvent("nonexistent-id", formData(baseEventFields({ categoryId: "nonexistent-id" })))).rejects.toThrow(
      "Not authorized"
    )
  })

  it("cancelEvent rejects a KIOSK-role account, even for a garbage eventId", async () => {
    await createVolunteer({ clerkId: "clerk_kiosk_cane", role: "KIOSK" })
    mockSignedInAs("clerk_kiosk_cane")

    await expect(cancelEvent("nonexistent-id")).rejects.toThrow("Not authorized")
  })

  it("updateEvent is rejected for a volunteer who is neither the creator nor ADMIN", async () => {
    const admin = await createVolunteer({ clerkId: "clerk_admin_ue1", role: "ADMIN" })
    const event = await createEventRow(admin.id)
    await createVolunteer({ clerkId: "clerk_other_ue", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_other_ue")

    await expect(updateEvent(event.id, formData({ ...baseEventFields(), categoryId: event.categoryId }))).rejects.toThrow("Not authorized")
  })

  it("updateEvent succeeds for the event's own creator", async () => {
    const scheduler = await prisma.volunteer.create({
      data: { clerkId: "clerk_sched_ue", name: "Scheduler", role: "VOLUNTEER", status: "ACTIVE", tier: "GREEN", canScheduleEvents: true }
    })
    const event = await createEventRow(scheduler.id)
    mockSignedInAs("clerk_sched_ue")
    const newTitle = `Updated ${unique()}`

    await captureRedirect(() => updateEvent(event.id, formData({ ...baseEventFields({ title: newTitle }), categoryId: event.categoryId })))

    const updated = await prisma.event.findUniqueOrThrow({ where: { id: event.id } })
    expect(updated.title).toBe(newTitle)
  })

  it("cancelEvent is rejected for a non-creator, non-ADMIN volunteer", async () => {
    const admin = await createVolunteer({ clerkId: "clerk_admin_ce1", role: "ADMIN" })
    const event = await createEventRow(admin.id)
    await createVolunteer({ clerkId: "clerk_other_cane", role: "VOLUNTEER" })
    mockSignedInAs("clerk_other_cane")

    await expect(cancelEvent(event.id)).rejects.toThrow("Not authorized")
    expect((await prisma.event.findUniqueOrThrow({ where: { id: event.id } })).canceledAt).toBeNull()
  })

  it("cancelEvent sets canceledAt and rejects a second cancellation", async () => {
    const admin = await createVolunteer({ clerkId: "clerk_admin_ce2", role: "ADMIN" })
    const event = await createEventRow(admin.id)
    mockSignedInAs("clerk_admin_ce2")

    await captureRedirect(() => cancelEvent(event.id))
    const canceled = await prisma.event.findUniqueOrThrow({ where: { id: event.id } })
    expect(canceled.canceledAt).not.toBeNull()

    await expect(cancelEvent(event.id)).rejects.toThrow("already canceled")
  })
})

describe("signupForEvent / cancelSignup — KIOSK", () => {
  // V4.md Session 1: KIOSK is a shared, read-only display account — signupForEvent/
  // cancelSignup used to gate only on requireVolunteer() ("any signed-in person"), the same
  // self-service gap several other actions had.
  it("rejects a KIOSK-role account signing up, and writes nothing", async () => {
    const admin = await createVolunteer({ clerkId: "clerk_admin_kiosksignup", role: "ADMIN" })
    const event = await createEventRow(admin.id)
    await createVolunteer({ clerkId: "clerk_kiosk_signup", role: "KIOSK" })
    mockSignedInAs("clerk_kiosk_signup")

    await expect(signupForEvent(event.id)).rejects.toThrow("Not authorized")
    expect(await prisma.eventSignup.count({ where: { eventId: event.id } })).toBe(0)
  })

  it("rejects a KIOSK-role account canceling, even for a garbage eventId — the role check runs first", async () => {
    await createVolunteer({ clerkId: "clerk_kiosk_cancelsignup", role: "KIOSK" })
    mockSignedInAs("clerk_kiosk_cancelsignup")

    await expect(cancelSignup("nonexistent-id")).rejects.toThrow("Not authorized")
  })
})

describe("signupForEvent — gating", () => {
  it("rejects signup server-side when requiredTagId isn't held, even though the UI would never surface this event", async () => {
    const admin = await createVolunteer({ clerkId: "clerk_admin_gate1", role: "ADMIN" })
    const tag = await getVolunteerTag()
    const event = await createEventRow(admin.id, { requiredTagId: tag.id })
    const volunteer = await createVolunteer({ clerkId: "clerk_vol_gate1", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_gate1")

    await expect(signupForEvent(event.id)).rejects.toThrow("Not eligible")
    expect(await prisma.eventSignup.count({ where: { eventId: event.id, volunteerId: volunteer.id } })).toBe(0)
  })

  it("allows signup once the volunteer holds the required tag", async () => {
    const admin = await createVolunteer({ clerkId: "clerk_admin_gate2", role: "ADMIN" })
    const tag = await getVolunteerTag()
    const event = await createEventRow(admin.id, { requiredTagId: tag.id })
    const volunteer = await createVolunteer({ clerkId: "clerk_vol_gate2", role: "VOLUNTEER" })
    await prisma.volunteerTagAssignment.create({ data: { volunteerId: volunteer.id, tagId: tag.id, assignedById: admin.id } })
    mockSignedInAs("clerk_vol_gate2")

    await captureRedirect(() => signupForEvent(event.id))

    expect(await prisma.eventSignup.count({ where: { eventId: event.id, volunteerId: volunteer.id } })).toBe(1)
  })

  it("rejects signup for a Green volunteer on a Blue-tier-gated event", async () => {
    const admin = await createVolunteer({ clerkId: "clerk_admin_gate3", role: "ADMIN" })
    const event = await createEventRow(admin.id, { requiredTier: "BLUE" })
    await createVolunteer({ clerkId: "clerk_vol_gate3", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_gate3")

    await expect(signupForEvent(event.id)).rejects.toThrow("Not eligible")
  })

  it("rejects signup for a canceled event", async () => {
    const admin = await createVolunteer({ clerkId: "clerk_admin_gate4", role: "ADMIN" })
    const event = await createEventRow(admin.id, { canceledAt: new Date() })
    await createVolunteer({ clerkId: "clerk_vol_gate4", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_gate4")

    await expect(signupForEvent(event.id)).rejects.toThrow("canceled")
  })

  it("rejects a duplicate active signup", async () => {
    const admin = await createVolunteer({ clerkId: "clerk_admin_dup", role: "ADMIN" })
    const event = await createEventRow(admin.id)
    await createVolunteer({ clerkId: "clerk_vol_dup", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_dup")
    await captureRedirect(() => signupForEvent(event.id))

    await expect(signupForEvent(event.id)).rejects.toThrow("Already signed up")
  })
})

describe("signupForEvent — capacity and waitlist", () => {
  it("confirms signups under capacity and waitlists once full", async () => {
    const admin = await createVolunteer({ clerkId: "clerk_admin_cap", role: "ADMIN" })
    const event = await createEventRow(admin.id, { capacity: 1 })
    const first = await createVolunteer({ clerkId: "clerk_vol_cap1", role: "VOLUNTEER" })
    const second = await createVolunteer({ clerkId: "clerk_vol_cap2", role: "VOLUNTEER" })

    mockSignedInAs("clerk_vol_cap1")
    await captureRedirect(() => signupForEvent(event.id))
    mockSignedInAs("clerk_vol_cap2")
    await captureRedirect(() => signupForEvent(event.id))

    const firstSignup = await prisma.eventSignup.findUniqueOrThrow({ where: { eventId_volunteerId: { eventId: event.id, volunteerId: first.id } } })
    const secondSignup = await prisma.eventSignup.findUniqueOrThrow({ where: { eventId_volunteerId: { eventId: event.id, volunteerId: second.id } } })
    expect(firstSignup.status).toBe("CONFIRMED")
    expect(secondSignup.status).toBe("WAITLISTED")
  })

  it("has unlimited capacity when capacity is null", async () => {
    const admin = await createVolunteer({ clerkId: "clerk_admin_uncap", role: "ADMIN" })
    const event = await createEventRow(admin.id, { capacity: null })
    for (let i = 0; i < 3; i++) {
      const volunteer = await createVolunteer({ role: "VOLUNTEER" })
      mockSignedInAs(volunteer.clerkId!)
      await captureRedirect(() => signupForEvent(event.id))
    }

    const statuses = await prisma.eventSignup.findMany({ where: { eventId: event.id } })
    expect(statuses.every((s) => s.status === "CONFIRMED")).toBe(true)
  })

  it("promotes the earliest waitlisted signup to CONFIRMED when a confirmed signup cancels", async () => {
    const admin = await createVolunteer({ clerkId: "clerk_admin_promo", role: "ADMIN" })
    const event = await createEventRow(admin.id, { capacity: 1 })
    await createVolunteer({ clerkId: "clerk_vol_promo1", role: "VOLUNTEER" })
    const second = await createVolunteer({ clerkId: "clerk_vol_promo2", role: "VOLUNTEER" })
    const third = await createVolunteer({ clerkId: "clerk_vol_promo3", role: "VOLUNTEER" })

    mockSignedInAs("clerk_vol_promo1")
    await captureRedirect(() => signupForEvent(event.id))
    mockSignedInAs("clerk_vol_promo2")
    await captureRedirect(() => signupForEvent(event.id))
    mockSignedInAs("clerk_vol_promo3")
    await captureRedirect(() => signupForEvent(event.id))

    mockSignedInAs("clerk_vol_promo1")
    await captureRedirect(() => cancelSignup(event.id))

    const secondSignup = await prisma.eventSignup.findUniqueOrThrow({ where: { eventId_volunteerId: { eventId: event.id, volunteerId: second.id } } })
    const thirdSignup = await prisma.eventSignup.findUniqueOrThrow({ where: { eventId_volunteerId: { eventId: event.id, volunteerId: third.id } } })
    expect(secondSignup.status).toBe("CONFIRMED")
    expect(thirdSignup.status).toBe("WAITLISTED")
  })

  it("does not promote anyone when a waitlisted (not confirmed) signup cancels", async () => {
    const admin = await createVolunteer({ clerkId: "clerk_admin_nopromo", role: "ADMIN" })
    const event = await createEventRow(admin.id, { capacity: 1 })
    const first = await createVolunteer({ clerkId: "clerk_vol_nopromo1", role: "VOLUNTEER" })
    await createVolunteer({ clerkId: "clerk_vol_nopromo2", role: "VOLUNTEER" })

    mockSignedInAs("clerk_vol_nopromo1")
    await captureRedirect(() => signupForEvent(event.id))
    mockSignedInAs("clerk_vol_nopromo2")
    await captureRedirect(() => signupForEvent(event.id))

    await captureRedirect(() => cancelSignup(event.id))

    const firstSignup = await prisma.eventSignup.findUniqueOrThrow({ where: { eventId_volunteerId: { eventId: event.id, volunteerId: first.id } } })
    expect(firstSignup.status).toBe("CONFIRMED")
  })

  it("re-signing up after a cancellation flips the same row back rather than creating a duplicate", async () => {
    const admin = await createVolunteer({ clerkId: "clerk_admin_resignup", role: "ADMIN" })
    const event = await createEventRow(admin.id)
    const volunteer = await createVolunteer({ clerkId: "clerk_vol_resignup", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_resignup")

    await captureRedirect(() => signupForEvent(event.id))
    await captureRedirect(() => cancelSignup(event.id))
    await captureRedirect(() => signupForEvent(event.id))

    const rows = await prisma.eventSignup.findMany({ where: { eventId: event.id, volunteerId: volunteer.id } })
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("CONFIRMED")
  })

  it("cancelSignup rejects an already-canceled signup", async () => {
    const admin = await createVolunteer({ clerkId: "clerk_admin_dblcancel", role: "ADMIN" })
    const event = await createEventRow(admin.id)
    await createVolunteer({ clerkId: "clerk_vol_dblcancel", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_dblcancel")
    await captureRedirect(() => signupForEvent(event.id))
    await captureRedirect(() => cancelSignup(event.id))

    await expect(cancelSignup(event.id)).rejects.toThrow("already canceled")
  })
})

describe("signup notifications", () => {
  it("notifies the organizer and watchers on signup, and always sends the volunteer their own confirmation", async () => {
    const organizer = await createVolunteer({ clerkId: "clerk_org_notif", role: "ADMIN", email: "organizer@example.com" })
    const watcher = await createVolunteer({ role: "VOLUNTEER", email: "watcher@example.com" })
    const event = await prisma.event.create({
      data: {
        title: `Test Event ${unique()}`,
        categoryId: (await getEventCategory()).id,
        startAt: new Date(Date.now() + 86400000),
        endAt: new Date(Date.now() + 90000000),
        createdById: organizer.id,
        watchers: { create: [{ volunteerId: watcher.id }] }
      }
    })
    await createVolunteer({ clerkId: "clerk_signer_notif", role: "VOLUNTEER", email: "signer@example.com" })
    mockSignedInAs("clerk_signer_notif")

    await captureRedirect(() => signupForEvent(event.id))

    const recipients = sendEmailMock.mock.calls.map((call) => call[0].to)
    expect(recipients).toContain("organizer@example.com")
    expect(recipients).toContain("watcher@example.com")
    expect(recipients).toContain("signer@example.com")
  })

  it("suppresses organizer/watcher notifications when suppressSignupNotifications is set, but still sends the volunteer's own confirmation", async () => {
    const organizer = await createVolunteer({ clerkId: "clerk_org_suppress", role: "ADMIN", email: "organizer2@example.com" })
    const event = await createEventRow(organizer.id, { suppressSignupNotifications: true })
    await createVolunteer({ clerkId: "clerk_signer_suppress", role: "VOLUNTEER", email: "signer2@example.com" })
    mockSignedInAs("clerk_signer_suppress")

    await captureRedirect(() => signupForEvent(event.id))

    const recipients = sendEmailMock.mock.calls.map((call) => call[0].to)
    expect(recipients).not.toContain("organizer2@example.com")
    expect(recipients).toContain("signer2@example.com")
  })

  it("notifies the promoted volunteer and the organizer on waitlist promotion", async () => {
    const organizer = await createVolunteer({ clerkId: "clerk_org_promo_notif", role: "ADMIN", email: "organizer3@example.com" })
    const event = await createEventRow(organizer.id, { capacity: 1 })
    await createVolunteer({ clerkId: "clerk_vol_promo_notif1", role: "VOLUNTEER", email: "promo1@example.com" })
    await createVolunteer({ clerkId: "clerk_vol_promo_notif2", role: "VOLUNTEER", email: "promo2@example.com" })

    mockSignedInAs("clerk_vol_promo_notif1")
    await captureRedirect(() => signupForEvent(event.id))
    mockSignedInAs("clerk_vol_promo_notif2")
    await captureRedirect(() => signupForEvent(event.id))

    sendEmailMock.mockClear()
    mockSignedInAs("clerk_vol_promo_notif1")
    await captureRedirect(() => cancelSignup(event.id))

    const recipients = sendEmailMock.mock.calls.map((call) => call[0].to)
    expect(recipients).toContain("promo2@example.com")
    expect(recipients).toContain("organizer3@example.com")
  })
})
