"use server"

import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma, withChangeLog } from "@/lib/prisma"

function readAnimalFields(formData: FormData) {
  const intakeDateRaw = formData.get("intakeDate")
  const caseReferenceRaw = formData.get("caseReference")
  const handlingNotesRaw = formData.get("handlingNotes")
  const notesRaw = formData.get("notes")
  const herdOrderRaw = formData.get("herdOrder")

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
    notes: notesRaw ? String(notesRaw) : null,
    herdOrder: herdOrderRaw && String(herdOrderRaw).length > 0 ? parseInt(String(herdOrderRaw), 10) : null
  }
}

export async function createAnimal(formData: FormData) {
  const volunteer = await requireRole(["ADMIN"])
  const fields = readAnimalFields(formData)

  const animal = await withChangeLog(prisma, volunteer.id, "Horse intake").animal.create({
    data: fields
  })

  redirect(`/animals/${animal.id}`)
}

export async function updateAnimal(animalId: string, formData: FormData) {
  const volunteer = await requireRole(["ADMIN"])
  const fields = readAnimalFields(formData)

  await withChangeLog(prisma, volunteer.id, "Horse record updated").animal.update({
    where: { id: animalId },
    data: fields
  })

  redirect(`/animals/${animalId}`)
}
