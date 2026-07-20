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
  overrides: Partial<{
    name: string
    status: "ACTIVE" | "ADOPTED" | "RETURNED" | "DECEASED" | "TRANSFERRED" | "FOSTER" | "PENDING_ADOPTION"
    intakeDate: Date
    intakeGroupId: string
  }> = {}
) {
  return prisma.animal.create({
    data: {
      name: overrides.name ?? `Test Horse ${randomUUID().slice(0, 8)}`,
      status: overrides.status ?? "ACTIVE",
      intakeDate: overrides.intakeDate,
      intakeGroupId: overrides.intakeGroupId
    }
  })
}

export async function createIntakeGroup(overrides: Partial<{ label: string; intakeDate: Date; isActive: boolean }> = {}) {
  return prisma.intakeGroup.create({
    data: {
      label: overrides.label ?? `Test Group ${randomUUID().slice(0, 8)}`,
      intakeDate: overrides.intakeDate ?? new Date("2026-01-01"),
      isActive: overrides.isActive ?? true
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
export const getTierThreshold = (tier: "GREEN" | "ORANGE" | "YELLOW" | "BLUE" = "BLUE") => prisma.tierThreshold.findFirstOrThrow({ where: { tier } })
export const getCredentialType = (name = "Volunteer Manual Acknowledgment") => prisma.credentialType.findFirstOrThrow({ where: { name } })
export const getVolunteerTag = (name = "Go Team") => prisma.volunteerTag.findFirstOrThrow({ where: { name } })
export const getEventCategory = (name = "Meetup") => prisma.eventCategory.findFirstOrThrow({ where: { name } })
export const getFacilityTaskType = (category: "TROUGH_CLEAN" | "STALL_CLEAN" | "STALL_STRIP" = "TROUGH_CLEAN") =>
  prisma.facilityTaskType.findFirstOrThrow({ where: { category } })

export async function createEvent(
  createdById: string,
  overrides: Partial<{
    title: string
    categoryId: string
    startAt: Date
    endAt: Date
    capacity: number | null
    requiredTagId: string | null
    requiredTier: "GREEN" | "ORANGE" | "YELLOW" | "BLUE" | "RED" | null
    suppressSignupNotifications: boolean
    canceledAt: Date | null
  }> = {}
) {
  const category = overrides.categoryId ? { id: overrides.categoryId } : await getEventCategory()
  const startAt = overrides.startAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  return prisma.event.create({
    data: {
      title: overrides.title ?? `Test Event ${randomUUID().slice(0, 8)}`,
      categoryId: category.id,
      startAt,
      endAt: overrides.endAt ?? new Date(startAt.getTime() + 2 * 60 * 60 * 1000),
      capacity: overrides.capacity,
      createdById,
      requiredTagId: overrides.requiredTagId,
      requiredTier: overrides.requiredTier,
      suppressSignupNotifications: overrides.suppressSignupNotifications ?? false,
      canceledAt: overrides.canceledAt
    }
  })
}
