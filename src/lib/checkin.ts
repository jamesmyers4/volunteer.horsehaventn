import { prisma, withChangeLog } from "./prisma"
import { getFarmSettings } from "./farmSettings"
import { determineShiftTypeForNow } from "./shifts"

const DEFAULT_KIOSK_WORK_TYPE = "Regular Shift"

/**
 * V2.md Session 2's tenure-clock rule ("set from the first recorded shift/check-in, never
 * touched again") lives here so both the retrospective web form (src/app/checkin/actions.ts)
 * and the real-time kiosk/QR toggle (performKioskToggle below) apply it identically.
 */
export async function maybeSetFirstShiftDate(volunteer: { id: string; firstShiftDate: Date | null }, checkInAt: Date) {
  if (volunteer.firstShiftDate) return
  await withChangeLog(prisma, volunteer.id, "First shift date set from first check-in").volunteer.update({
    where: { id: volunteer.id },
    data: { firstShiftDate: checkInAt }
  })
}

// Matches the UTC-date-string convention already used by submitCheckIn (src/app/checkin/
// actions.ts's `new Date(date)` from an ISO date input) and src/app/checkin/page.tsx's
// todayStart — not locale/local-timezone Date components, which would parse to a
// different calendar day in non-UTC environments and create a second, mismatched Shift
// row for what a human would call "the same day."
function startOfDay(date: Date) {
  return new Date(date.toISOString().slice(0, 10))
}

export type KioskToggleResult = {
  action: "checked-in" | "checked-out"
  volunteerName: string
  at: Date
}

/**
 * The real-time tap-in/tap-out flow V2.md Session 5 calls for — additive to the existing
 * retrospective WEB_FORM flow at /checkin, not a replacement (CONTEXT.md §8 already
 * anticipated this: "the same shape supports true real-time check-in/out later ... without
 * a schema change"). Toggle logic, not date-scoped: the most recent open CheckIn (any date)
 * for this volunteer gets closed; if none is open, a new one starts now. This also
 * self-heals a forgotten checkout from a prior day rather than leaving it open forever.
 * No auth check here on purpose — this is reached from an unauthenticated kiosk tablet or a
 * volunteer's own QR code, identified by checkInCode alone (see src/app/kiosk/actions.ts).
 */
export async function performKioskToggle(code: string, now: Date = new Date()): Promise<KioskToggleResult> {
  const volunteer = await prisma.volunteer.findUnique({ where: { checkInCode: code } })
  if (!volunteer) throw new Error("Code not recognized")

  const openCheckIn = await prisma.checkIn.findFirst({
    where: { volunteerId: volunteer.id, checkOutAt: null },
    orderBy: { checkInAt: "desc" }
  })

  if (openCheckIn) {
    await withChangeLog(prisma, volunteer.id, "Kiosk check-out").checkIn.update({
      where: { id: openCheckIn.id },
      data: { checkOutAt: now, checkOutMethod: "KIOSK" }
    })
    return { action: "checked-out", volunteerName: volunteer.name, at: now }
  }

  const [farmSettings, templates] = await Promise.all([getFarmSettings(), prisma.shiftTemplate.findMany()])
  const shiftType = determineShiftTypeForNow(templates, farmSettings.activeSeason, now)
  const date = startOfDay(now)

  const shift = await prisma.shift.upsert({
    where: { date_type: { date, type: shiftType } },
    update: {},
    create: { date, type: shiftType }
  })

  const workType = await prisma.workType.findFirst({ where: { name: DEFAULT_KIOSK_WORK_TYPE, active: true } })
  if (!workType) throw new Error(`No "${DEFAULT_KIOSK_WORK_TYPE}" WorkType configured`)

  await withChangeLog(prisma, volunteer.id, "Kiosk check-in").checkIn.create({
    data: {
      volunteerId: volunteer.id,
      shiftId: shift.id,
      workTypeId: workType.id,
      checkInAt: now,
      checkInMethod: "KIOSK"
    }
  })

  await maybeSetFirstShiftDate(volunteer, now)

  return { action: "checked-in", volunteerName: volunteer.name, at: now }
}
