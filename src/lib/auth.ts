import { auth } from "@clerk/nextjs/server"
import { prisma } from "./prisma"

export type Role = "ADMIN" | "SHIFT_LEAD" | "VOLUNTEER" | "GUEST"

export async function getCurrentVolunteer() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated || !userId) return null
  return prisma.volunteer.findUnique({ where: { clerkId: userId } })
}

export async function requireVolunteer() {
  const volunteer = await getCurrentVolunteer()
  if (!volunteer) throw new Error("Not authenticated")
  return volunteer
}

export async function requireRole(allowed: Role[]) {
  const volunteer = await requireVolunteer()
  if (!allowed.includes(volunteer.role)) throw new Error("Not authorized")
  return volunteer
}
