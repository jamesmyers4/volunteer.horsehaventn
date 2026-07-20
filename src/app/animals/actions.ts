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
    status: String(formData.get("status")) as "ACTIVE" | "ADOPTED" | "RETURNED" | "DECEASED" | "TRANSFERRED" | "FOSTER" | "PENDING_ADOPTION",
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

  // V3.md Session 1: an animal can't arrive already ADOPTED — Placement (adopter info) can
  // only be created via createPlacement (src/app/animals/[id]/placement-actions.ts), which
  // is the sole path that also flips status to ADOPTED. See the matching check in
  // updateAnimal below for why this pairing is enforced at all.
  if (fields.status === "ADOPTED") throw new Error("Use the Record Placement action to mark an animal ADOPTED, so adopter info is captured alongside the status change")

  const animal = await withChangeLog(prisma, volunteer.id, "Horse intake").animal.create({
    data: fields
  })

  redirect(`/animals/${animal.id}`)
}

export async function updateAnimal(animalId: string, formData: FormData) {
  const volunteer = await requireRole(["ADMIN"])
  const fields = readAnimalFields(formData)

  // V3.md Session 1: "moving Animal.status to ADOPTED should coincide with a Placement row
  // being created/finalized" — the plain edit form had no such enforcement before this
  // session (confirmed: it just set the field directly). Only a *transition into* ADOPTED is
  // blocked here; an already-ADOPTED animal (real Placement already on file) can still have
  // its other fields edited without re-triggering this check.
  const current = await prisma.animal.findUniqueOrThrow({ where: { id: animalId } })
  if (fields.status === "ADOPTED" && current.status !== "ADOPTED") {
    throw new Error("Use the Record Placement action to mark an animal ADOPTED, so adopter info is captured alongside the status change")
  }

  await withChangeLog(prisma, volunteer.id, "Horse record updated").animal.update({
    where: { id: animalId },
    data: fields
  })

  redirect(`/animals/${animalId}`)
}
