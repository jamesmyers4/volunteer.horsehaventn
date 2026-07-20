"use server"

import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// IntakeGroup is an admin-managed lookup table, same category as Location/EventCategory —
// not ChangeLog-tracked (V3.md Session 1: "lookup-ish, same category as EventCategory").
// Full CRUD lives here rather than being deferred to the Admin Console (unlike Location's
// own split) since V3.md's own Session 1 test-coverage list explicitly asks for "IntakeGroup
// CRUD," not just create+read.
export async function createIntakeGroup(formData: FormData) {
  await requireRole(["ADMIN"])

  const label = String(formData.get("label"))
  const intakeDate = new Date(String(formData.get("intakeDate")))
  const notesRaw = formData.get("notes")

  const group = await prisma.intakeGroup.create({
    data: { label, intakeDate, notes: notesRaw ? String(notesRaw) : undefined }
  })

  redirect(`/intake-groups/${group.id}`)
}

// No hard deletes (CLAUDE.md) — deactivate via isActive, same as RecurringTaskTemplate/
// Location's own isActive pattern, rather than removing the row.
export async function updateIntakeGroup(intakeGroupId: string, formData: FormData) {
  await requireRole(["ADMIN"])

  const label = String(formData.get("label"))
  const intakeDate = new Date(String(formData.get("intakeDate")))
  const notesRaw = formData.get("notes")
  const isActive = formData.get("isActive") === "on"

  await prisma.intakeGroup.update({
    where: { id: intakeGroupId },
    data: { label, intakeDate, notes: notesRaw ? String(notesRaw) : null, isActive }
  })

  redirect(`/intake-groups/${intakeGroupId}`)
}
