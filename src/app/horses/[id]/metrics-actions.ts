"use server"

import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma, withChangeLog } from "@/lib/prisma"

export async function createWeightEntry(horseId: string, formData: FormData) {
  const volunteer = await requireRole(["ADMIN", "SHIFT_LEAD"])

  const weight = String(formData.get("weight"))
  const context = String(formData.get("context")) as "ROUTINE" | "ASSESSMENT"
  const notesRaw = formData.get("notes")
  const notes = notesRaw ? String(notesRaw) : undefined
  const today = new Date(new Date().toISOString().slice(0, 10))

  await withChangeLog(prisma, volunteer.id, "Weight entry logged").weightEntry.create({
    data: { horseId, date: today, weight, context, recordedBy: volunteer.id, notes }
  })

  redirect(`/horses/${horseId}`)
}

export async function createHorseMetric(horseId: string, formData: FormData) {
  const volunteer = await requireRole(["ADMIN", "SHIFT_LEAD"])

  const metricTypeId = String(formData.get("metricTypeId"))
  const value = String(formData.get("value"))
  const notesRaw = formData.get("notes")
  const notes = notesRaw ? String(notesRaw) : undefined
  const today = new Date(new Date().toISOString().slice(0, 10))

  await withChangeLog(prisma, volunteer.id, "Metric logged").horseMetric.create({
    data: { horseId, metricTypeId, value, date: today, recordedBy: volunteer.id, notes }
  })

  redirect(`/horses/${horseId}`)
}
