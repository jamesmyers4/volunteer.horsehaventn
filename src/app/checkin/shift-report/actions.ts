"use server"

import { redirect } from "next/navigation"
import { requireNonKioskVolunteer } from "@/lib/auth"
import { prisma, withChangeLog } from "@/lib/prisma"
import { canSubmitShiftReport } from "@/lib/shiftReport"
import type { ShiftTypeValue } from "@/lib/shifts"

/**
 * V3.md Session 5: only the Shift's occurrence-scoped assignedLeadId or global ADMIN may
 * submit — narrower than the roster's Admin-or-Shift-Lead-org-wide rule, see
 * src/lib/shiftReport.ts's canSubmitShiftReport for why. One ShiftReport per Shift, enforced
 * both by the app check below and the DB-level @unique on ShiftReport.shiftId. Responses are
 * created directly against `prisma`, not the withChangeLog-wrapped client — confirmed with
 * James that only the ShiftReport row itself (who/when submitted) is worth tracking, not each
 * individual response (see the model's own schema comment).
 */
export async function submitShiftReport(date: string, shiftType: ShiftTypeValue, formData: FormData) {
  const actor = await requireNonKioskVolunteer()

  const shift = await prisma.shift.upsert({
    where: { date_type: { date: new Date(date), type: shiftType } },
    update: {},
    create: { date: new Date(date), type: shiftType }
  })

  if (!canSubmitShiftReport(actor, shift)) throw new Error("Not authorized")

  const existing = await prisma.shiftReport.findUnique({ where: { shiftId: shift.id } })
  if (existing) throw new Error("A shift report has already been submitted for this shift")

  const templateId = String(formData.get("templateId"))
  const template = await prisma.checklistTemplate.findUniqueOrThrow({
    where: { id: templateId },
    include: { items: true }
  })

  const report = await withChangeLog(prisma, actor.id, "End-of-shift report submission").shiftReport.create({
    data: { shiftId: shift.id, templateId, submittedById: actor.id }
  })

  for (const item of template.items) {
    const raw = formData.get(`item_${item.id}`)
    const value = item.responseType === "BOOLEAN" ? String(raw === "on") : raw === null ? "" : String(raw)
    await prisma.shiftReportResponse.create({
      data: { shiftReportId: report.id, templateItemId: item.id, value }
    })
  }

  redirect(`/checkin/shift-report?date=${date}&shiftType=${shiftType}&success=1`)
}
