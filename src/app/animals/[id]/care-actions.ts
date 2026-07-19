"use server"

import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma, withChangeLog } from "@/lib/prisma"

export async function createCareEntry(animalId: string, formData: FormData) {
  const volunteer = await requireRole(["ADMIN", "SHIFT_LEAD"])

  const careTypeId = String(formData.get("careTypeId"))
  const notesRaw = formData.get("notes")
  const notes = notesRaw ? String(notesRaw) : undefined
  const relatedHealthIssueIdRaw = formData.get("relatedHealthIssueId")
  const relatedHealthIssueId = relatedHealthIssueIdRaw && String(relatedHealthIssueIdRaw).length > 0 ? String(relatedHealthIssueIdRaw) : undefined
  const today = new Date(new Date().toISOString().slice(0, 10))

  await withChangeLog(prisma, volunteer.id, "Care entry logged").careEntry.create({
    data: { animalId, careTypeId, date: today, notes, performedBy: volunteer.id, relatedHealthIssueId }
  })

  redirect(`/animals/${animalId}`)
}

export async function createHealthIssue(animalId: string, formData: FormData) {
  const volunteer = await requireRole(["ADMIN", "SHIFT_LEAD"])

  const description = String(formData.get("description"))
  const today = new Date(new Date().toISOString().slice(0, 10))

  await withChangeLog(prisma, volunteer.id, "Health issue opened").healthIssue.create({
    data: { animalId, description, startDate: today }
  })

  redirect(`/animals/${animalId}`)
}

export async function resolveHealthIssue(issueId: string, animalId: string) {
  const volunteer = await requireRole(["ADMIN", "SHIFT_LEAD"])
  const today = new Date(new Date().toISOString().slice(0, 10))

  await withChangeLog(prisma, volunteer.id, "Health issue resolved").healthIssue.update({
    where: { id: issueId },
    data: { active: false, resolvedDate: today }
  })

  redirect(`/animals/${animalId}`)
}
