"use server"

import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma, withChangeLog } from "@/lib/prisma"

// VolunteerTag is an admin-managed lookup table, same category as Location/CredentialType/
// TierThreshold — not ChangeLog-tracked. Creating a new tag TYPE (e.g. "Go Team") is
// Admin-only, matching the split CLAUDE.md documents for Location: defining the lookup
// value is Admin-only, assigning it to a volunteer is Admin-or-Shift-Lead (see assignTag
// below).
export async function createVolunteerTag(formData: FormData) {
  await requireRole(["ADMIN"])

  const name = String(formData.get("name"))
  const descriptionRaw = formData.get("description")
  const minDaysSinceBlueReleaseRaw = formData.get("minDaysSinceBlueRelease")

  await prisma.volunteerTag.create({
    data: {
      name,
      description: descriptionRaw ? String(descriptionRaw) : undefined,
      minDaysSinceBlueRelease: minDaysSinceBlueReleaseRaw ? Number(minDaysSinceBlueReleaseRaw) : undefined
    }
  })

  redirect("/tags")
}

export async function updateVolunteerTag(tagId: string, formData: FormData) {
  await requireRole(["ADMIN"])

  const descriptionRaw = formData.get("description")
  const active = formData.get("active") === "on"
  const minDaysSinceBlueReleaseRaw = formData.get("minDaysSinceBlueRelease")

  await prisma.volunteerTag.update({
    where: { id: tagId },
    data: {
      description: descriptionRaw ? String(descriptionRaw) : null,
      active,
      minDaysSinceBlueRelease: minDaysSinceBlueReleaseRaw ? Number(minDaysSinceBlueReleaseRaw) : null
    }
  })

  redirect("/tags")
}

// Assignment/removal is always manual, Admin or Shift Lead (V2.md Session 3) — never
// automatic, even for volunteers who show up on the eligibility-candidates report below.
// App-side duplicate check rather than a DB constraint, matching this project's general
// preference for app-side checks on rarely-changing admin-entered data (CONTEXT.md §10).
export async function assignTag(volunteerId: string, formData: FormData) {
  const actor = await requireRole(["ADMIN", "SHIFT_LEAD"])
  const tagId = String(formData.get("tagId"))

  const existing = await prisma.volunteerTagAssignment.findFirst({ where: { volunteerId, tagId, removedAt: null } })
  if (existing) throw new Error("Volunteer already holds this tag")

  await withChangeLog(prisma, actor.id).volunteerTagAssignment.create({
    data: { volunteerId, tagId, assignedById: actor.id }
  })

  redirect(`/volunteers/${volunteerId}`)
}

// Soft-removal (removedAt/removedById), not a delete — matches RegularShiftAssignment's
// close-don't-delete pattern elsewhere in this schema. ChangeLog captures the update itself.
export async function removeTag(assignmentId: string) {
  const actor = await requireRole(["ADMIN", "SHIFT_LEAD"])

  const assignment = await prisma.volunteerTagAssignment.findUniqueOrThrow({ where: { id: assignmentId } })
  if (assignment.removedAt) throw new Error("Tag assignment already removed")

  await withChangeLog(prisma, actor.id).volunteerTagAssignment.update({
    where: { id: assignmentId },
    data: { removedAt: new Date(), removedById: actor.id }
  })

  redirect(`/volunteers/${assignment.volunteerId}`)
}
