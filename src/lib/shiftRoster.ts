import { prisma } from "@/lib/prisma"
import { startOfDay, dayOfWeekFor } from "@/lib/facilityTasks"

export type ShiftTypeValue = "AM" | "PM"

export { startOfDay, dayOfWeekFor }

/**
 * V3.md Session 4: the default expected roster for a given Shift occurrence — every
 * Volunteer with an active RegularShiftAssignment (active, and `date` within
 * startDate/endDate) matching that date's dayOfWeek + the given shiftType, plus any
 * Volunteer who already has a CheckIn row for that Shift (walk-ons/fill-ins who
 * self-checked-in via QR/kiosk without a standing RegularShiftAssignment). Derived at
 * render time, same "don't pre-generate, match against the calendar fact" approach as
 * src/lib/facilityTasks.ts's getExpectedFacilityTasks — there's no stored "roster" row,
 * just this query.
 */
export async function getDefaultRoster(date: Date, shiftType: ShiftTypeValue) {
  const day = startOfDay(date)
  const dayOfWeek = dayOfWeekFor(day)

  const shift = await prisma.shift.findUnique({
    where: { date_type: { date: day, type: shiftType } },
    include: { assignedLead: true }
  })

  const [regulars, existingCheckIns] = await Promise.all([
    prisma.regularShiftAssignment.findMany({
      where: {
        dayOfWeek,
        shiftType,
        active: true,
        startDate: { lte: day },
        OR: [{ endDate: null }, { endDate: { gte: day } }]
      },
      include: { volunteer: true },
      orderBy: { volunteer: { name: "asc" } }
    }),
    shift
      ? prisma.checkIn.findMany({ where: { shiftId: shift.id }, include: { volunteer: true } })
      : Promise.resolve([])
  ])

  type RosterEntry = {
    volunteerId: string
    volunteer: (typeof regulars)[number]["volunteer"]
    checkIn: (typeof existingCheckIns)[number] | null
    fromRegularAssignment: boolean
  }

  const entries = new Map<string, RosterEntry>()
  for (const regular of regulars) {
    entries.set(regular.volunteerId, {
      volunteerId: regular.volunteerId,
      volunteer: regular.volunteer,
      checkIn: null,
      fromRegularAssignment: true
    })
  }
  for (const checkIn of existingCheckIns) {
    const existing = entries.get(checkIn.volunteerId)
    if (existing) {
      existing.checkIn = checkIn
    } else {
      entries.set(checkIn.volunteerId, {
        volunteerId: checkIn.volunteerId,
        volunteer: checkIn.volunteer,
        checkIn,
        fromRegularAssignment: false
      })
    }
  }

  const roster = Array.from(entries.values()).sort((a, b) => a.volunteer.name.localeCompare(b.volunteer.name))

  return { shift, roster }
}

export type DefaultRoster = Awaited<ReturnType<typeof getDefaultRoster>>

/**
 * Whether `actor` may run the bulk roster attendance action for `shift` — the shift's own
 * occurrence-scoped `assignedLeadId`, OR a Volunteer holding global role ADMIN/SHIFT_LEAD
 * (V3.md's explicit permission rule; a global Shift Lead's existing org-wide shift access,
 * per CLAUDE.md's Permissions Quick Reference, isn't narrowed by this new occurrence-level
 * concept — it's additive).
 */
export function canManageShiftRoster(actor: { id: string; role: string }, shift: { assignedLeadId: string | null } | null) {
  if (actor.role === "ADMIN" || actor.role === "SHIFT_LEAD") return true
  return shift?.assignedLeadId === actor.id
}
