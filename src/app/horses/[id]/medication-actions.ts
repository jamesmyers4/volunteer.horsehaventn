"use server"

import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma, withChangeLog } from "@/lib/prisma"

export async function createMedicationRegimen(horseId: string, formData: FormData) {
  const volunteer = await requireRole(["ADMIN"])

  const drugName = String(formData.get("drugName"))
  const dose = String(formData.get("dose"))
  const routeRaw = formData.get("route")
  const route = routeRaw ? String(routeRaw) : undefined
  const frequency = String(formData.get("frequency"))
  const notesRaw = formData.get("notes")
  const notes = notesRaw ? String(notesRaw) : undefined
  const today = new Date(new Date().toISOString().slice(0, 10))

  await withChangeLog(prisma, volunteer.id, "Medication regimen added").medicationRegimen.create({
    data: { horseId, drugName, dose, route, frequency, startDate: today, notes }
  })

  redirect(`/horses/${horseId}`)
}

export async function endMedicationRegimen(regimenId: string, horseId: string) {
  const volunteer = await requireRole(["ADMIN"])
  const today = new Date(new Date().toISOString().slice(0, 10))

  await withChangeLog(prisma, volunteer.id, "Medication regimen ended").medicationRegimen.update({
    where: { id: regimenId },
    data: { endDate: today }
  })

  redirect(`/horses/${horseId}`)
}

export async function logMedicationAdministered(regimenId: string, horseId: string, formData: FormData) {
  const volunteer = await requireRole(["ADMIN", "SHIFT_LEAD"])

  const administered = formData.get("administered") === "true"
  const notesRaw = formData.get("notes")
  const notes = notesRaw ? String(notesRaw) : undefined
  const today = new Date(new Date().toISOString().slice(0, 10))

  await withChangeLog(prisma, volunteer.id, "Medication log entry").medicationLog.create({
    data: { medicationRegimenId: regimenId, date: today, administered, administeredBy: volunteer.id, notes }
  })

  redirect(`/horses/${horseId}`)
}
