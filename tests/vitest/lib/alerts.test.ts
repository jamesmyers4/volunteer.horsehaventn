import { describe, it, expect } from "vitest"
import { isLiveAlert, isAlertVisibleForViewer, getViewerShiftType, getLiveAlerts } from "@/lib/alerts"
import { prisma } from "@/lib/prisma"
import { createVolunteer, getChatChannel, getWorkType } from "../helpers/factories"

describe("isLiveAlert", () => {
  const base = { pinned: true, createdAt: new Date("2026-07-20T12:00:00Z"), expiresAt: null as Date | null }

  it("is false when not pinned, regardless of window", () => {
    expect(isLiveAlert({ ...base, pinned: false }, new Date("2026-07-20T13:00:00Z"))).toBe(false)
  })

  it("is false before createdAt", () => {
    expect(isLiveAlert(base, new Date("2026-07-20T11:59:59Z"))).toBe(false)
  })

  it("is true exactly at createdAt (inclusive boundary)", () => {
    expect(isLiveAlert(base, new Date("2026-07-20T12:00:00Z"))).toBe(true)
  })

  it("is true with a null expiresAt no matter how far in the future 'now' is — a standing alert never auto-expires", () => {
    expect(isLiveAlert(base, new Date("2099-01-01T00:00:00Z"))).toBe(true)
  })

  it("is true exactly at expiresAt (inclusive boundary)", () => {
    const withExpiry = { ...base, expiresAt: new Date("2026-07-20T18:00:00Z") }
    expect(isLiveAlert(withExpiry, new Date("2026-07-20T18:00:00Z"))).toBe(true)
  })

  it("is false just after expiresAt", () => {
    const withExpiry = { ...base, expiresAt: new Date("2026-07-20T18:00:00Z") }
    expect(isLiveAlert(withExpiry, new Date("2026-07-20T18:00:01Z"))).toBe(false)
  })
})

describe("isAlertVisibleForViewer", () => {
  it("a BROADCAST channel is always visible, regardless of the viewer's shift", () => {
    expect(isAlertVisibleForViewer({ type: "BROADCAST", shiftType: null }, "AM")).toBe(true)
    expect(isAlertVisibleForViewer({ type: "BROADCAST", shiftType: null }, "PM")).toBe(true)
  })

  it("a SHIFT channel is only visible to a matching-shiftType viewer", () => {
    expect(isAlertVisibleForViewer({ type: "SHIFT", shiftType: "AM" }, "AM")).toBe(true)
    expect(isAlertVisibleForViewer({ type: "SHIFT", shiftType: "AM" }, "PM")).toBe(false)
  })

  it("an ADMIN channel is never visible as a banner", () => {
    expect(isAlertVisibleForViewer({ type: "ADMIN", shiftType: null }, "AM")).toBe(false)
  })
})

describe("getViewerShiftType", () => {
  it("returns the shift of the volunteer's currently open CheckIn when one exists", async () => {
    const volunteer = await createVolunteer()
    const workType = await getWorkType()
    const shift = await prisma.shift.create({ data: { date: new Date("2026-07-20"), type: "PM" } })
    await prisma.checkIn.create({
      data: { volunteerId: volunteer.id, shiftId: shift.id, workTypeId: workType.id, checkInAt: new Date("2026-07-20T16:00:00Z") }
    })

    expect(await getViewerShiftType(volunteer.id, new Date("2026-07-20T17:00:00Z"))).toBe("PM")
  })

  it("falls back to time-of-day resolution (determineShiftTypeForNow) when there's no open CheckIn", async () => {
    const volunteer = await createVolunteer()
    // 09:30 local falls inside the seeded AM window (09:00-11:00 standard).
    const nineThirtyAm = new Date()
    nineThirtyAm.setHours(9, 30, 0, 0)

    expect(await getViewerShiftType(volunteer.id, nineThirtyAm)).toBe("AM")
  })
})

describe("getLiveAlerts", () => {
  it("returns a live pinned BROADCAST message and excludes an unpinned one", async () => {
    const admin = await createVolunteer({ role: "ADMIN" })
    const volunteer = await createVolunteer()
    const broadcast = await getChatChannel("BROADCAST")

    const pinned = await prisma.chatMessage.create({
      data: { channelId: broadcast.id, senderId: admin.id, body: "Farm closed for weather", pinned: true, severity: "URGENT" }
    })
    await prisma.chatMessage.create({ data: { channelId: broadcast.id, senderId: admin.id, body: "just chatting", pinned: false } })

    const alerts = await getLiveAlerts(volunteer.id)
    expect(alerts.map((a) => a.id)).toEqual([pinned.id])
  })

  it("scopes a SHIFT-channel alert to the volunteer's own current shift, and excludes an expired one", async () => {
    const admin = await createVolunteer({ role: "ADMIN" })
    const volunteer = await createVolunteer()
    const workType = await getWorkType()
    const amChannel = await getChatChannel("SHIFT", "AM")
    const pmChannel = await getChatChannel("SHIFT", "PM")

    const shift = await prisma.shift.create({ data: { date: new Date("2026-07-20"), type: "AM" } })
    await prisma.checkIn.create({
      data: { volunteerId: volunteer.id, shiftId: shift.id, workTypeId: workType.id, checkInAt: new Date("2026-07-20T09:00:00Z") }
    })

    const now = new Date("2026-07-20T09:30:00Z")
    const matchingAlert = await prisma.chatMessage.create({
      data: { channelId: amChannel.id, senderId: admin.id, body: "AM: mucking gear moved to Wash Bay", pinned: true, createdAt: new Date("2026-07-20T08:00:00Z") }
    })
    // Wrong shift — volunteer is checked into AM, this is posted to PM's channel.
    await prisma.chatMessage.create({ data: { channelId: pmChannel.id, senderId: admin.id, body: "PM only note", pinned: true } })
    // Expired standing alert on the same AM channel.
    await prisma.chatMessage.create({
      data: {
        channelId: amChannel.id,
        senderId: admin.id,
        body: "old expired note",
        pinned: true,
        createdAt: new Date("2026-07-01T00:00:00Z"),
        expiresAt: new Date("2026-07-10T00:00:00Z")
      }
    })

    const alerts = await getLiveAlerts(volunteer.id, now)
    expect(alerts.map((a) => a.id)).toEqual([matchingAlert.id])
  })

  it("never returns a pinned ADMIN-channel message, even for an Admin viewer", async () => {
    const admin = await createVolunteer({ role: "ADMIN" })
    const adminChannel = await getChatChannel("ADMIN")
    await prisma.chatMessage.create({ data: { channelId: adminChannel.id, senderId: admin.id, body: "internal note", pinned: true } })

    expect(await getLiveAlerts(admin.id)).toEqual([])
  })
})
