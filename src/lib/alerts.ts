// V3.md Session 3: shift alerts & announcements, built as an extension of the existing
// ChatChannel/ChatMessage system (a pinned message *is* the alert — no parallel Alert
// model). Pure gating logic lives here so it's exercised for real by both the global banner
// (src/app/AlertBanner.tsx) and the /chat page, same "extract it so the UI and tests share
// real logic" pattern as src/lib/tier.ts, src/lib/shifts.ts, src/lib/facilityTasks.ts.

import { prisma } from "./prisma"
import { getFarmSettings } from "./farmSettings"
import { determineShiftTypeForNow, type ShiftTypeValue } from "./shifts"

export type ChatChannelTypeValue = "BROADCAST" | "ADMIN" | "SHIFT"
export type AlertSeverityValue = "INFO" | "WARNING" | "URGENT"

/**
 * A message is a "live alert" when pinned is true and `now` falls between createdAt and
 * expiresAt (inclusive of both boundaries), or expiresAt is null (a standing alert that
 * never auto-expires — e.g. a cold-weather reminder). Pure and DB-free so the boundary
 * conditions can be tested directly.
 */
export function isLiveAlert(message: { pinned: boolean; createdAt: Date; expiresAt: Date | null }, now: Date): boolean {
  if (!message.pinned) return false
  if (now < message.createdAt) return false
  if (message.expiresAt && now > message.expiresAt) return false
  return true
}

/**
 * Scope filtering (V3.md Session 3): a BROADCAST channel's live alerts banner across every
 * authenticated view; a SHIFT-type channel's live alerts only banner for a volunteer whose
 * current shift context matches that channel's shiftType. ADMIN-channel messages never
 * banner — the spec only calls out BROADCAST and SHIFT-type channels as banner sources.
 */
export function isAlertVisibleForViewer(channel: { type: ChatChannelTypeValue; shiftType: ShiftTypeValue | null }, viewerShiftType: ShiftTypeValue): boolean {
  if (channel.type === "BROADCAST") return true
  if (channel.type === "SHIFT") return channel.shiftType === viewerShiftType
  return false
}

/**
 * "Viewing/on that matching shift" for a volunteer with no explicit shift selected anywhere
 * in the current request (the banner renders on every page, not just a shift-scoped one):
 * prefer the shift they're actually checked into right now (an open CheckIn) — that's the
 * "on" case — and fall back to whichever shift window is in progress by time of day (the
 * same resolution the kiosk uses, src/lib/checkin.ts's performKioskToggle) for "viewing"
 * outside an active check-in.
 */
export async function getViewerShiftType(volunteerId: string, now: Date = new Date()): Promise<ShiftTypeValue> {
  const openCheckIn = await prisma.checkIn.findFirst({
    where: { volunteerId, checkOutAt: null },
    include: { shift: true },
    orderBy: { checkInAt: "desc" }
  })
  if (openCheckIn) return openCheckIn.shift.type

  const [farmSettings, templates] = await Promise.all([getFarmSettings(), prisma.shiftTemplate.findMany()])
  return determineShiftTypeForNow(templates, farmSettings.activeSeason, now)
}

/**
 * All currently-live alerts visible to this volunteer, across BROADCAST and their
 * shift-matched SHIFT channel. Pinned messages are rare by nature (an admin action, not
 * routine chat), so this fetches every pinned row and filters in memory with the same pure
 * functions covered by direct unit tests, rather than re-encoding the window/scope rules a
 * second time as a Prisma `where` clause.
 */
export async function getLiveAlerts(volunteerId: string, now: Date = new Date()) {
  const viewerShiftType = await getViewerShiftType(volunteerId, now)
  const pinnedMessages = await prisma.chatMessage.findMany({
    where: { pinned: true },
    include: { channel: true, sender: true },
    orderBy: { createdAt: "desc" }
  })
  return pinnedMessages.filter((message) => isLiveAlert(message, now) && isAlertVisibleForViewer(message.channel, viewerShiftType))
}
