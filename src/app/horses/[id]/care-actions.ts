"use server"

import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma, withChangeLog } from "@/lib/prisma"

export async function createCareEntry(horseId: string, formData: FormData) {
  const volunteer = await requireRole(["ADMIN", "SHIFT_LEAD"])

  const careTypeId = String(formData.get("careTypeId"))
  const notesRaw = formData.get("notes")
  const notes = notesRaw ? String(notesRaw) : undefined
  const relatedHealthIssueIdRaw = formData.get("relatedHealthIssueId")
  const relatedHealthIssueId = relatedHealthIssueIdRaw && String(relatedHealthIssueIdRaw).length > 0 ? String(relatedHealthIssueIdRaw) : undefined
  const today = new Date(new Date().toISOString().slice(0, 10))

  await withChangeLog(prisma, volunteer.id, "Care entry logged").careEntry.create({
    data: { horseId, careTypeId, date: today, notes, performedBy: volunteer.id, relatedHealthIssueId }
  })

  redirect(`/horses/${horseId}`)
}

export async function createHealthIssue(horseId: string, formData: FormData) {
  const volunteer = await requireRole(["ADMIN", "SHIFT_LEAD"])

  const description = String(formData.get("description"))
  const today = new Date(new Date().toISOString().slice(0, 10))

  await withChangeLog(prisma, volunteer.id, "Health issue opened").healthIssue.create({
    data: { horseId, description, startDate: today }
  })

  redirect(`/horses/${horseId}`)
}

export async function resolveHealthIssue(issueId: string, horseId: string) {
  const volunteer = await requireRole(["ADMIN", "SHIFT_LEAD"])
  const today = new Date(new Date().toISOString().slice(0, 10))

  await withChangeLog(prisma, volunteer.id, "Health issue resolved").healthIssue.update({
    where: { id: issueId },
    data: { active: false, resolvedDate: today }
  })

  redirect(`/horses/${horseId}`)
}
