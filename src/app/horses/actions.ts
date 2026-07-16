"use server"

import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma, withChangeLog } from "@/lib/prisma"

function readHorseFields(formData: FormData) {
  const intakeDateRaw = formData.get("intakeDate")
  const caseReferenceRaw = formData.get("caseReference")
  const handlingNotesRaw = formData.get("handlingNotes")
  const notesRaw = formData.get("notes")

  return {
    name: String(formData.get("name")),
    intakeDate: intakeDateRaw ? new Date(String(intakeDateRaw)) : null,
    status: String(formData.get("status")) as "ACTIVE" | "ADOPTED" | "RETURNED" | "DECEASED" | "TRANSFERRED",
    sex: String(formData.get("sex")) as "STALLION" | "GELDING" | "MARE" | "COLT" | "FILLY" | "RIDGLING" | "UNKNOWN",
    spayed: formData.get("spayed") === "on",
    legalCase: formData.get("legalCase") === "on",
    caseReference: caseReferenceRaw ? String(caseReferenceRaw) : null,
    requiredHandlerColor: String(formData.get("requiredHandlerColor")) as "GREEN" | "ORANGE" | "YELLOW" | "BLUE" | "RED",
    handlingNotes: handlingNotesRaw ? String(handlingNotesRaw) : null,
    notes: notesRaw ? String(notesRaw) : null
  }
}

export async function createHorse(formData: FormData) {
  const volunteer = await requireRole(["ADMIN"])
  const fields = readHorseFields(formData)

  const horse = await withChangeLog(prisma, volunteer.id, "Horse intake").horse.create({
    data: fields
  })

  redirect(`/horses/${horse.id}`)
}

export async function updateHorse(horseId: string, formData: FormData) {
  const volunteer = await requireRole(["ADMIN"])
  const fields = readHorseFields(formData)

  await withChangeLog(prisma, volunteer.id, "Horse record updated").horse.update({
    where: { id: horseId },
    data: fields
  })

  redirect(`/horses/${horseId}`)
}
