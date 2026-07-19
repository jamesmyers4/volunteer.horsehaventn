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

  // V2.md Session 6: the Feed Board reuses this same action for its inline edit affordance
  // (rather than a parallel write path) but needs to land back on the board, not the animal
  // detail page — an optional hidden redirectTo field lets the caller override the default
  // without changing behavior for the animal detail page's own form (no redirectTo → same
  // `/animals/{id}` target as before).
  const redirectToRaw = formData.get("redirectTo")
  redirect(redirectToRaw ? String(redirectToRaw) : `/animals/${animalId}`)
}
