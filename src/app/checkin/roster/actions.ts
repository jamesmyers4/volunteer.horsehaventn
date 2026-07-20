"use server"

import { redirect } from "next/navigation"
import { requireVolunteer, requireRole } from "@/lib/auth"
import { prisma, withChangeLog } from "@/lib/prisma"
import { getFarmSettings } from "@/lib/farmSettings"
import { resolveShiftTimesForOccurrence, type ShiftTypeValue } from "@/lib/shifts"
import { maybeSetFirstShiftDate } from "@/lib/checkin"
import { canManageShiftRoster } from "@/lib/shiftRoster"

// Same default WorkType src/lib/checkin.ts's kiosk toggle uses — a bulk roster submission
// is, by definition, the standing regular-shift case (walk-ons added to the list are still
// marked present the same way), not something that needs its own WorkType category.
const DEFAULT_ROSTER_WORK_TYPE = "Regular Shift"

/**
 * V3.md Session 4: occurrence-scoped shift leadership, layered on top of the existing global
 * SHIFT_LEAD role. Setting it is Admin-or-Shift-Lead, mirroring setShiftActualTimes's own
 * permission split on this same Shift model (src/app/checkin/actions.ts) — a global lead
 * naming who's actually running one specific occurrence, which may be a plain Volunteer
 * filling in.
 */
export async function assignShiftLead(date: string, shiftType: ShiftTypeValue, formData: FormData) {
  const actor = await requireRole(["ADMIN", "SHIFT_LEAD"])

  const rawLeadId = formData.get("assignedLeadId")
  const assignedLeadId = rawLeadId && String(rawLeadId).length > 0 ? String(rawLeadId) : null

  const shift = await prisma.shift.upsert({
    where: { date_type: { date: new Date(date), type: shiftType } },
    update: {},
    create: { date: new Date(date), type: shiftType }
  })

  await withChangeLog(prisma, actor.id, "Occurrence shift lead assignment").shift.update({
    where: { id: shift.id },
    data: { assignedLeadId }
  })

  redirect(`/checkin/roster?date=${date}&shiftType=${shiftType}`)
}

/**
 * Bulk attendance submit — "default everyone present, uncheck absentees," per V3.md. Only
 * creates a CheckIn for a volunteer who doesn't already have one for this Shift; an existing
 * row (e.g. a real self-check-in via QR/kiosk) is never touched, so its real method/times
 * are preserved exactly as V3.md requires. `presentVolunteerIds` covers both the default
 * roster and any walk-on the leader added to the list — both are submitted the same way,
 * since by the time this runs there's no meaningful difference between the two lists.
 */
export async function submitRosterAttendance(date: string, shiftType: ShiftTypeValue, formData: FormData) {
  const actor = await requireVolunteer()

  const shift = await prisma.shift.upsert({
    where: { date_type: { date: new Date(date), type: shiftType } },
    update: {},
    create: { date: new Date(date), type: shiftType }
  })

  if (!canManageShiftRoster(actor, shift)) throw new Error("Not authorized")

  const presentVolunteerIds = Array.from(new Set(formData.getAll("presentVolunteerIds").map(String).filter(Boolean)))
  if (presentVolunteerIds.length === 0) {
    redirect(`/checkin/roster?date=${date}&shiftType=${shiftType}`)
  }

  const [farmSettings, template] = await Promise.all([
    getFarmSettings(),
    prisma.shiftTemplate.findUnique({ where: { shiftType } })
  ])
  const resolved = template ? resolveShiftTimesForOccurrence(template, shift, farmSettings.activeSeason) : null

  const checkInTimeInput = formData.get("checkInTime")
  const checkOutTimeInput = formData.get("checkOutTime")
  const checkInTime = checkInTimeInput && String(checkInTimeInput).length > 0 ? String(checkInTimeInput) : resolved?.start
  const checkOutTime = checkOutTimeInput && String(checkOutTimeInput).length > 0 ? String(checkOutTimeInput) : resolved?.end
  if (!checkInTime || !checkOutTime) throw new Error("No resolved shift time available — enter times directly")

  const checkInAt = new Date(`${date}T${checkInTime}:00`)
  const checkOutAt = new Date(`${date}T${checkOutTime}:00`)

  const [existingCheckIns, workType] = await Promise.all([
    prisma.checkIn.findMany({ where: { shiftId: shift.id, volunteerId: { in: presentVolunteerIds } } }),
    prisma.workType.findFirst({ where: { name: DEFAULT_ROSTER_WORK_TYPE, active: true } })
  ])
  if (!workType) throw new Error(`No "${DEFAULT_ROSTER_WORK_TYPE}" WorkType configured`)

  const alreadyCovered = new Set(existingCheckIns.map((c) => c.volunteerId))
  const toCreate = presentVolunteerIds.filter((id) => !alreadyCovered.has(id))

  for (const volunteerId of toCreate) {
    await withChangeLog(prisma, actor.id, "Bulk roster attendance").checkIn.create({
      data: {
        volunteerId,
        shiftId: shift.id,
        workTypeId: workType.id,
        checkInAt,
        checkOutAt,
        checkInMethod: "ADMIN_ENTRY",
        loggedById: actor.id
      }
    })
    const volunteer = await prisma.volunteer.findUniqueOrThrow({ where: { id: volunteerId } })
    await maybeSetFirstShiftDate(volunteer, checkInAt)
  }

  redirect(`/checkin/roster?date=${date}&shiftType=${shiftType}&success=1`)
}
