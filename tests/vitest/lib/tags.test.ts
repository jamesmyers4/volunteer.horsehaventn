import { randomUUID } from "node:crypto"
import { describe, it, expect } from "vitest"
import { getTagEligibilityCandidates } from "@/lib/tags"
import { prisma } from "@/lib/prisma"
import { getVolunteerTag } from "../helpers/factories"

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000)
const unique = () => randomUUID().slice(0, 8)

async function blueReleasedVolunteer(overrides: Partial<{ firstShiftDate: Date; blueReleasedAt: Date; status: "ACTIVE" | "INACTIVE" }> = {}) {
  return prisma.volunteer.create({
    data: {
      clerkId: `clerk_${unique()}`,
      name: `Test Volunteer ${unique()}`,
      role: "VOLUNTEER",
      status: overrides.status ?? "ACTIVE",
      tier: "GREEN",
      firstShiftDate: overrides.firstShiftDate ?? daysAgo(1000),
      blueReleasedAt: overrides.blueReleasedAt ?? daysAgo(200)
    }
  })
}

describe("getTagEligibilityCandidates", () => {
  it("returns an empty list for a tag with no threshold configured", async () => {
    const tag = await prisma.volunteerTag.create({ data: { name: `Test Tag ${unique()}` } })
    await blueReleasedVolunteer()

    const candidates = await getTagEligibilityCandidates(tag.id)

    expect(candidates).toEqual([])
  })

  it("includes a Blue-released volunteer who has cleared the tenure-since-release bar", async () => {
    const tag = await prisma.volunteerTag.create({ data: { name: `Test Tag ${unique()}`, minDaysSinceBlueRelease: 90 } })
    const volunteer = await blueReleasedVolunteer({ blueReleasedAt: daysAgo(100) })

    const candidates = await getTagEligibilityCandidates(tag.id)

    expect(candidates.map((c) => c.id)).toContain(volunteer.id)
  })

  it("excludes a Blue-released volunteer who hasn't cleared the tenure-since-release bar yet", async () => {
    const tag = await prisma.volunteerTag.create({ data: { name: `Test Tag ${unique()}`, minDaysSinceBlueRelease: 90 } })
    const volunteer = await blueReleasedVolunteer({ blueReleasedAt: daysAgo(10) })

    const candidates = await getTagEligibilityCandidates(tag.id)

    expect(candidates.map((c) => c.id)).not.toContain(volunteer.id)
  })

  it("excludes a volunteer who isn't actualTier BLUE (never released) regardless of tenure", async () => {
    const tag = await prisma.volunteerTag.create({ data: { name: `Test Tag ${unique()}`, minDaysSinceBlueRelease: 90 } })
    const volunteer = await prisma.volunteer.create({
      data: {
        clerkId: `clerk_${unique()}`,
        name: `Test Volunteer ${unique()}`,
        role: "VOLUNTEER",
        status: "ACTIVE",
        tier: "GREEN",
        firstShiftDate: daysAgo(1000),
        blueReleasedAt: null
      }
    })

    const candidates = await getTagEligibilityCandidates(tag.id)

    expect(candidates.map((c) => c.id)).not.toContain(volunteer.id)
  })

  it("excludes a volunteer who already actively holds the tag — this is a candidates report, not a member list", async () => {
    const tag = await prisma.volunteerTag.create({ data: { name: `Test Tag ${unique()}`, minDaysSinceBlueRelease: 90 } })
    const volunteer = await blueReleasedVolunteer({ blueReleasedAt: daysAgo(100) })
    const admin = await prisma.volunteer.create({
      data: { clerkId: `clerk_${unique()}`, name: "Admin", role: "ADMIN", status: "ACTIVE", tier: "GREEN" }
    })
    await prisma.volunteerTagAssignment.create({ data: { volunteerId: volunteer.id, tagId: tag.id, assignedById: admin.id } })

    const candidates = await getTagEligibilityCandidates(tag.id)

    expect(candidates.map((c) => c.id)).not.toContain(volunteer.id)
  })

  it("re-includes a volunteer whose tag assignment was removed (no longer an active holder)", async () => {
    const tag = await prisma.volunteerTag.create({ data: { name: `Test Tag ${unique()}`, minDaysSinceBlueRelease: 90 } })
    const volunteer = await blueReleasedVolunteer({ blueReleasedAt: daysAgo(100) })
    const admin = await prisma.volunteer.create({
      data: { clerkId: `clerk_${unique()}`, name: "Admin", role: "ADMIN", status: "ACTIVE", tier: "GREEN" }
    })
    await prisma.volunteerTagAssignment.create({
      data: { volunteerId: volunteer.id, tagId: tag.id, assignedById: admin.id, removedAt: new Date(), removedById: admin.id }
    })

    const candidates = await getTagEligibilityCandidates(tag.id)

    expect(candidates.map((c) => c.id)).toContain(volunteer.id)
  })

  it("works against the seeded Go Team tag", async () => {
    const tag = await getVolunteerTag("Go Team")
    expect(tag.minDaysSinceBlueRelease).not.toBeNull()

    await expect(getTagEligibilityCandidates(tag.id)).resolves.toBeInstanceOf(Array)
  })
})
