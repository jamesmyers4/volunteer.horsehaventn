"use server"

import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma, withChangeLog } from "@/lib/prisma"

export async function createFeedingBaseline(animalId: string, formData: FormData) {
  const volunteer = await requireRole(["ADMIN"])

  const feedTypeId = String(formData.get("feedTypeId"))
  const shift = String(formData.get("shift")) as "AM" | "PM"
  const amount = String(formData.get("amount"))
  const requiresSoaking = formData.get("requiresSoaking") === "on"
  const notesRaw = formData.get("notes")
  const notes = notesRaw ? String(notesRaw) : undefined

  await withChangeLog(prisma, volunteer.id, "Feeding baseline added").feedingBaseline.create({
    data: { animalId, feedTypeId, shift, amount, requiresSoaking, notes }
  })

  redirect(`/animals/${animalId}`)
}

export async function createFeedingOverride(baselineId: string, animalId: string, formData: FormData) {
  const volunteer = await requireRole(["ADMIN", "SHIFT_LEAD"])

  const amountRaw = formData.get("amount")
  const amount = amountRaw && String(amountRaw).length > 0 ? String(amountRaw) : null
  const reasonRaw = formData.get("reason")
  const reason = reasonRaw ? String(reasonRaw) : undefined
  const notesRaw = formData.get("notes")
  const notes = notesRaw ? String(notesRaw) : undefined
  const today = new Date(new Date().toISOString().slice(0, 10))

  await withChangeLog(prisma, volunteer.id, "Feeding override logged").feedingOverride.create({
    data: { feedingBaselineId: baselineId, date: today, amount, reason, changedBy: volunteer.id, notes }
  })

  redirect(`/animals/${animalId}`)
}
