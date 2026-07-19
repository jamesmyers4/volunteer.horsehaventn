import { describe, it, expect } from "vitest"
import { releaseBlue } from "@/app/volunteers/tier-actions"
import { updateTierThreshold } from "@/app/tiers/actions"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs } from "../helpers/auth-mock"
import { createVolunteer, getTierThreshold } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000)

describe("releaseBlue", () => {
  it("is Admin or Shift Lead — a plain Volunteer is rejected", async () => {
    const target = await createVolunteer()
    await createVolunteer({ clerkId: "clerk_vol_rb", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_rb")

    await expect(releaseBlue(target.id)).rejects.toThrow("Not authorized")
    const unchanged = await prisma.volunteer.findUniqueOrThrow({ where: { id: target.id } })
    expect(unchanged.blueReleasedAt).toBeNull()
  })

  it("is blocked when the volunteer hasn't met Blue's tenure threshold yet — confirmed with James, not allowed-with-a-flag", async () => {
    const target = await prisma.volunteer.create({
      data: { clerkId: "clerk_target_rb1", name: "Target One", role: "VOLUNTEER", status: "ACTIVE", tier: "GREEN", firstShiftDate: daysAgo(400) }
    })
    await createVolunteer({ clerkId: "clerk_admin_rb1", role: "ADMIN" })
    mockSignedInAs("clerk_admin_rb1")

    await expect(releaseBlue(target.id)).rejects.toThrow("has not met Blue's tenure threshold")
    const unchanged = await prisma.volunteer.findUniqueOrThrow({ where: { id: target.id } })
    expect(unchanged.blueReleasedAt).toBeNull()
  })

  it("succeeds once tenure is met, recording who released and when", async () => {
    const target = await prisma.volunteer.create({
      data: { clerkId: "clerk_target_rb2", name: "Target Two", role: "VOLUNTEER", status: "ACTIVE", tier: "GREEN", firstShiftDate: daysAgo(731) }
    })
    const admin = await createVolunteer({ clerkId: "clerk_admin_rb2", role: "ADMIN" })
    mockSignedInAs("clerk_admin_rb2")

    const url = await captureRedirect(() => releaseBlue(target.id))

    expect(url).toBe(`/volunteers/${target.id}`)
    const released = await prisma.volunteer.findUniqueOrThrow({ where: { id: target.id } })
    expect(released.blueReleasedAt).not.toBeNull()
    expect(released.blueReleasedById).toBe(admin.id)
  })

  it("a Shift Lead can also release — not Admin-restricted", async () => {
    const target = await prisma.volunteer.create({
      data: { clerkId: "clerk_target_rb3", name: "Target Three", role: "VOLUNTEER", status: "ACTIVE", tier: "GREEN", firstShiftDate: daysAgo(731) }
    })
    await createVolunteer({ clerkId: "clerk_lead_rb3", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_rb3")

    await captureRedirect(() => releaseBlue(target.id))

    const released = await prisma.volunteer.findUniqueOrThrow({ where: { id: target.id } })
    expect(released.blueReleasedAt).not.toBeNull()
  })

  it("rejects releasing a volunteer who is already Blue-released", async () => {
    const target = await prisma.volunteer.create({
      data: {
        clerkId: "clerk_target_rb4",
        name: "Target Four",
        role: "VOLUNTEER",
        status: "ACTIVE",
        tier: "GREEN",
        firstShiftDate: daysAgo(900),
        blueReleasedAt: daysAgo(10)
      }
    })
    await createVolunteer({ clerkId: "clerk_admin_rb4", role: "ADMIN" })
    mockSignedInAs("clerk_admin_rb4")

    await expect(releaseBlue(target.id)).rejects.toThrow("already Blue-released")
  })
})

describe("updateTierThreshold", () => {
  it("is Admin-only — a Shift Lead is rejected", async () => {
    const threshold = await getTierThreshold("ORANGE")
    await createVolunteer({ clerkId: "clerk_lead_tt", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_tt")

    await expect(updateTierThreshold(threshold.id, formData({ minDaysTenure: "999" }))).rejects.toThrow("Not authorized")
    const unchanged = await prisma.tierThreshold.findUniqueOrThrow({ where: { id: threshold.id } })
    expect(unchanged.minDaysTenure).toBe(threshold.minDaysTenure)
  })

  it("lets an Admin edit the tenure requirement, since exact thresholds are still approximate", async () => {
    const threshold = await getTierThreshold("ORANGE")
    await createVolunteer({ clerkId: "clerk_admin_tt", role: "ADMIN" })
    mockSignedInAs("clerk_admin_tt")

    const url = await captureRedirect(() => updateTierThreshold(threshold.id, formData({ minDaysTenure: "200" })))

    expect(url).toBe("/tiers")
    const updated = await prisma.tierThreshold.findUniqueOrThrow({ where: { id: threshold.id } })
    expect(updated.minDaysTenure).toBe(200)

    // Restore the seeded value so later tests in this run aren't affected — TierThreshold is
    // a lookup table (tests/vitest/helpers/db.ts) and never truncated between tests.
    await prisma.tierThreshold.update({ where: { id: threshold.id }, data: { minDaysTenure: threshold.minDaysTenure } })
  })
})
