import { randomUUID } from "node:crypto"
import { prisma } from "./db"
import type { Role } from "@/lib/auth"

export async function createVolunteer(
  overrides: Partial<{
    role: Role
    name: string
    email: string
    clerkId: string
    status: "ACTIVE" | "INACTIVE"
  }> = {}
) {
  const clerkId = overrides.clerkId ?? `clerk_${randomUUID()}`
  return prisma.volunteer.create({
    data: {
      clerkId,
      name: overrides.name ?? "Test Volunteer",
      email: overrides.email ?? `${clerkId}@example.com`,
      role: overrides.role ?? "VOLUNTEER",
      status: overrides.status ?? "ACTIVE",
      tier: "GREEN"
    }
  })
}

export async function createAnimal(
  overrides: Partial<{ name: string; status: "ACTIVE" | "ADOPTED" | "RETURNED" | "DECEASED" | "TRANSFERRED" }> = {}
) {
  return prisma.animal.create({
    data: {
      name: overrides.name ?? `Test Horse ${randomUUID().slice(0, 8)}`,
      status: overrides.status ?? "ACTIVE"
    }
  })
}

// Lookup/reference tables are seeded once (see db.ts's LOOKUP_TABLES) — fetch the real
// seeded rows rather than re-creating them, matching how the app actually queries them.
export const getFeedType = (name = "Senior") => prisma.feedType.findFirstOrThrow({ where: { name } })
export const getWorkType = (name = "Regular Shift") => prisma.workType.findFirstOrThrow({ where: { name } })
export const getCareType = (name = "Wound Check") => prisma.careType.findFirstOrThrow({ where: { name } })
export const getMetricType = (name = "Height") => prisma.metricType.findFirstOrThrow({ where: { name } })
export const getLocation = (fieldCode = "L1") => prisma.location.findFirstOrThrow({ where: { fieldCode } })
