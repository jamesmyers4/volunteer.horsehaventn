"use server"

import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

// EventCategory is an admin-managed lookup table, same category as WorkType/FeedType/Location
// — not ChangeLog-tracked. No CRUD existed anywhere before this session (V2.md Session 4
// seeded the six starting categories and deliberately deferred CRUD to the Admin Console — see
// HANDOFF.md's Session 4 note).
export async function createEventCategory(formData: FormData) {
  await requireRole(["ADMIN"])

  const name = String(formData.get("name"))
  await prisma.eventCategory.create({ data: { name } })

  redirect("/admin/event-categories")
}

export async function updateEventCategory(categoryId: string, formData: FormData) {
  await requireRole(["ADMIN"])

  const name = String(formData.get("name"))
  const active = formData.get("active") === "on"
  await prisma.eventCategory.update({ where: { id: categoryId }, data: { name, active } })

  redirect("/admin/event-categories")
}
