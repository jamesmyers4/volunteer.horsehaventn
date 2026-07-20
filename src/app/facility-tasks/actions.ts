"use server"

import { redirect } from "next/navigation"
import { requireRole, requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { validateTaskLocationPairing, startOfDay, type ShiftTypeValue } from "@/lib/facilityTasks"

// V3.md Session 2: what the admin's monthly calendar manages (the full calendar UI itself is
// deferred to Session 7 — this session builds the underlying create/edit actions plus a plain
// list, same "basic page now, polished Admin Console screen later" split Location/IntakeGroup
// already established). Admin-or-Shift-Lead, matching the spec's own permission line, not the
// Admin-only pattern FeedingBaseline/MedicationRegimen use.
export async function createRecurringTaskTemplate(formData: FormData) {
  await requireRole(["ADMIN", "SHIFT_LEAD"])

  const taskTypeId = String(formData.get("taskTypeId"))
  const targetLocationId = String(formData.get("targetLocationId"))
  const dayOfWeek = Number(formData.get("dayOfWeek"))
  const shiftType = String(formData.get("shiftType")) as ShiftTypeValue

  const [taskType, location] = await Promise.all([
    prisma.facilityTaskType.findUniqueOrThrow({ where: { id: taskTypeId } }),
    prisma.location.findUniqueOrThrow({ where: { id: targetLocationId } })
  ])
  validateTaskLocationPairing(taskType.category, location)

  await prisma.recurringTaskTemplate.create({
    data: { taskTypeId, targetLocationId, dayOfWeek, shiftType }
  })

  // V3.md Session 7: the Admin Console's own calendar screen reuses this action rather than
  // duplicating create logic, and needs to land back on /admin/facility-tasks instead of the
  // plain /facility-tasks list — same optional redirectTo pattern already established for
  // createLocation/createFeedingOverride/createLocationAssignment.
  const redirectTo = formData.get("redirectTo")
  redirect(redirectTo ? String(redirectTo) : "/facility-tasks")
}

// No hard deletes (CLAUDE.md) — deactivate via isActive, same as IntakeGroup/Location's own
// isActive pattern, rather than removing the row. Re-validates the pairing rule since the
// task type or location could both be changed here, not just isActive.
export async function updateRecurringTaskTemplate(templateId: string, formData: FormData) {
  await requireRole(["ADMIN", "SHIFT_LEAD"])

  const taskTypeId = String(formData.get("taskTypeId"))
  const targetLocationId = String(formData.get("targetLocationId"))
  const dayOfWeek = Number(formData.get("dayOfWeek"))
  const shiftType = String(formData.get("shiftType")) as ShiftTypeValue
  const isActive = formData.get("isActive") === "on"

  const [taskType, location] = await Promise.all([
    prisma.facilityTaskType.findUniqueOrThrow({ where: { id: taskTypeId } }),
    prisma.location.findUniqueOrThrow({ where: { id: targetLocationId } })
  ])
  validateTaskLocationPairing(taskType.category, location)

  await prisma.recurringTaskTemplate.update({
    where: { id: templateId },
    data: { taskTypeId, targetLocationId, dayOfWeek, shiftType, isActive }
  })

  const redirectTo = formData.get("redirectTo")
  redirect(redirectTo ? String(redirectTo) : "/facility-tasks")
}

// Any signed-in volunteer on a shift can log a completion — no role gate, matching CheckIn's
// own self-service permission rather than the Admin-or-Shift-Lead template-management split.
// Serves two paths with one action: checking off a row from today's derived expected-task list
// (templateId present — taskTypeId/targetLocationId/category are re-derived server-side from
// the template row itself, never trusted from a hidden form field) and the quick-add path for
// anything done outside the recurring pattern (templateId absent, taskType+location chosen
// directly). Not wrapped in withChangeLog — see the model's own schema comment for why
// FacilityTaskCompletion isn't a tracked model.
export async function logFacilityTaskCompletion(formData: FormData) {
  const volunteer = await requireVolunteer()

  const templateIdRaw = formData.get("templateId")
  const templateId = templateIdRaw && String(templateIdRaw).length > 0 ? String(templateIdRaw) : undefined
  const notesRaw = formData.get("notes")
  const notes = notesRaw ? String(notesRaw) : undefined
  const dateRaw = formData.get("date")
  const date = dateRaw && String(dateRaw).length > 0 ? new Date(String(dateRaw)) : startOfDay(new Date())

  let taskTypeId: string
  let targetLocationId: string
  let shiftType: ShiftTypeValue

  if (templateId) {
    const template = await prisma.recurringTaskTemplate.findUniqueOrThrow({
      where: { id: templateId },
      include: { taskType: true, targetLocation: true }
    })
    taskTypeId = template.taskTypeId
    targetLocationId = template.targetLocationId
    shiftType = template.shiftType
    validateTaskLocationPairing(template.taskType.category, template.targetLocation)
  } else {
    taskTypeId = String(formData.get("taskTypeId"))
    targetLocationId = String(formData.get("targetLocationId"))
    shiftType = String(formData.get("shiftType")) as ShiftTypeValue
    const [taskType, location] = await Promise.all([
      prisma.facilityTaskType.findUniqueOrThrow({ where: { id: taskTypeId } }),
      prisma.location.findUniqueOrThrow({ where: { id: targetLocationId } })
    ])
    validateTaskLocationPairing(taskType.category, location)
  }

  await prisma.facilityTaskCompletion.create({
    data: { taskTypeId, targetLocationId, date, shiftType, completedById: volunteer.id, notes, templateId }
  })

  redirect("/facility-tasks")
}
