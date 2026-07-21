"use server"

import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma, withChangeLog } from "@/lib/prisma"

type RoleInput = "ADMIN" | "SHIFT_LEAD" | "VOLUNTEER" | "GUEST" | "KIOSK"

// Volunteer.role has always been Admin-only per CLAUDE.md's Permissions Quick Reference, but
// no dedicated action existed to change it before this session (roles were only ever set at
// signup via the Clerk webhook, defaulting to VOLUNTEER). Volunteer is a tracked model
// (src/lib/prisma.ts), so this write goes through withChangeLog like every other Volunteer
// edit in this codebase.
export async function updateVolunteerRole(volunteerId: string, formData: FormData) {
  const actor = await requireRole(["ADMIN"])
  const role = String(formData.get("role")) as RoleInput

  await withChangeLog(prisma, actor.id).volunteer.update({
    where: { id: volunteerId },
    data: { role }
  })

  redirect("/admin/volunteers")
}

// canScheduleEvents is independent of role (V2.md Session 4) — grants event-creation ability
// to specific people without a full Admin promotion. No dedicated toggle existed anywhere
// before this session; it could only be set by hand against the database.
export async function updateCanScheduleEvents(volunteerId: string, formData: FormData) {
  const actor = await requireRole(["ADMIN"])
  const canScheduleEvents = formData.get("canScheduleEvents") === "on"

  await withChangeLog(prisma, actor.id).volunteer.update({
    where: { id: volunteerId },
    data: { canScheduleEvents }
  })

  redirect("/admin/volunteers")
}
