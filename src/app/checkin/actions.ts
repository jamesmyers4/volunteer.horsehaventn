"use server"

import { redirect } from "next/navigation"
import { requireNonKioskVolunteer, requireRole } from "@/lib/auth"
import { prisma, withChangeLog } from "@/lib/prisma"
import { maybeSetFirstShiftDate } from "@/lib/checkin"

export async function submitCheckIn(formData: FormData) {
  const volunteer = await requireNonKioskVolunteer()

  const date = String(formData.get("date"))
  const shiftType = String(formData.get("shiftType")) as "AM" | "PM"
  const workTypeId = String(formData.get("workTypeId"))
  const checkInTime = String(formData.get("checkInTime"))
  const checkOutTime = String(formData.get("checkOutTime"))
  const notes = formData.get("notes") ? String(formData.get("notes")) : undefined

  const checkInAt = new Date(`${date}T${checkInTime}:00`)
  const checkOutAt = new Date(`${date}T${checkOutTime}:00`)

  const shift = await prisma.shift.upsert({
    where: { date_type: { date: new Date(date), type: shiftType } },
    update: {},
    create: { date: new Date(date), type: shiftType }
  })

  await withChangeLog(prisma, volunteer.id, "Self-service check-in").checkIn.create({
    data: {
      volunteerId: volunteer.id,
      shiftId: shift.id,
      workTypeId,
      checkInAt,
      checkOutAt,
      checkInMethod: "WEB_FORM",
      checkOutMethod: "WEB_FORM",
      notes
    }
  })

  // V2.md Session 2: the tier progression tenure clock starts at the first recorded
  // shift/check-in, not account creation. Set exactly once — this check-in's own date, not
  // "now" — and never touched again after that (a second check-in leaves it alone). Shared
  // with the kiosk/QR real-time toggle (src/lib/checkin.ts) so both entry points apply the
  // rule identically.
  await maybeSetFirstShiftDate(volunteer, checkInAt)

  redirect("/checkin?success=1")
}

// V2.md Session 5: per-occurrence correction of the ShiftTemplate's resolved reference
// time — "we actually ran 15 minutes late today." Any SHIFT_LEAD or ADMIN can set this for
// any date+type occurrence (Shift Lead already has org-wide read access to shifts per
// CLAUDE.md's permission table, and this is a simple same-day correction, not scoped to a
// specific person's own assignment). "ADMIN can override a shift lead's override" just
// means both roles can write here — whoever writes last wins, no extra locking; who/when
// is captured by ChangeLog (Shift is a tracked model) rather than a dedicated field.
export async function setShiftActualTimes(date: string, shiftType: "AM" | "PM", formData: FormData) {
  const actor = await requireRole(["ADMIN", "SHIFT_LEAD"])

  const actualStartTime = String(formData.get("actualStartTime"))
  const actualEndTime = String(formData.get("actualEndTime"))

  const shift = await prisma.shift.upsert({
    where: { date_type: { date: new Date(date), type: shiftType } },
    update: {},
    create: { date: new Date(date), type: shiftType }
  })

  await withChangeLog(prisma, actor.id, "Shift actual time override").shift.update({
    where: { id: shift.id },
    data: { actualStartTime, actualEndTime }
  })

  redirect("/checkin")
}

// V3.md Session 4: this path didn't exist before this session — flagged in V3.md as
// something to "confirm whether it exists, add it if not." Self-only, matching this
// codebase's established self-attestation pattern (CredentialRecord, EventSignup) rather
// than an admin-on-behalf-of-someone-else path. Exists specifically so a volunteer can
// correct a bulk ADMIN_ENTRY default (src/app/checkin/roster/actions.ts) that doesn't match
// when they actually arrived/left, but works for any of their own CheckIn rows.
export async function updateOwnCheckIn(checkInId: string, formData: FormData) {
  const volunteer = await requireNonKioskVolunteer()

  const existing = await prisma.checkIn.findUniqueOrThrow({ where: { id: checkInId } })
  if (existing.volunteerId !== volunteer.id) throw new Error("Not authorized")

  const dateString = existing.checkInAt.toISOString().slice(0, 10)
  const checkInTime = String(formData.get("checkInTime"))
  const checkOutTime = String(formData.get("checkOutTime"))
  const notes = formData.get("notes") ? String(formData.get("notes")) : undefined

  await withChangeLog(prisma, volunteer.id, "Volunteer self-edit of own check-in").checkIn.update({
    where: { id: checkInId },
    data: {
      checkInAt: new Date(`${dateString}T${checkInTime}:00`),
      checkOutAt: new Date(`${dateString}T${checkOutTime}:00`),
      notes
    }
  })

  redirect("/checkin?success=1")
}
