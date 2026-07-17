import { describe, it, expect } from "vitest"
import { createFeedingBaseline, createFeedingOverride } from "@/app/horses/[id]/feeding-actions"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs } from "../helpers/auth-mock"
import { createHorse, createVolunteer, getFeedType } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

describe("createFeedingBaseline", () => {
  it("is Admin-only — Shift Lead is rejected", async () => {
    const horse = await createHorse()
    const feedType = await getFeedType()
    await createVolunteer({ clerkId: "clerk_lead_fb", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_fb")

    await expect(
      createFeedingBaseline(horse.id, formData({ feedTypeId: feedType.id, shift: "AM", amount: "1" }))
    ).rejects.toThrow("Not authorized")
    expect(await prisma.feedingBaseline.count()).toBe(0)
  })

  it("creates the baseline for an Admin, defaulting requiresSoaking off when unchecked", async () => {
    const horse = await createHorse()
    const feedType = await getFeedType("Alfalfa")
    await createVolunteer({ clerkId: "clerk_admin_fb", role: "ADMIN" })
    mockSignedInAs("clerk_admin_fb")

    const url = await captureRedirect(() =>
      createFeedingBaseline(horse.id, formData({ feedTypeId: feedType.id, shift: "PM", amount: "1.75" }))
    )

    expect(url).toBe(`/horses/${horse.id}`)
    const baseline = await prisma.feedingBaseline.findFirstOrThrow({ where: { horseId: horse.id } })
    expect(baseline.shift).toBe("PM")
    expect(baseline.amount.toString()).toBe("1.75")
    expect(baseline.requiresSoaking).toBe(false)
  })
})

describe("createFeedingOverride", () => {
  it("is Admin or Shift Lead — a plain Volunteer is rejected", async () => {
    const horse = await createHorse()
    const feedType = await getFeedType()
    const baseline = await prisma.feedingBaseline.create({
      data: { horseId: horse.id, feedTypeId: feedType.id, shift: "AM", amount: "1" }
    })
    await createVolunteer({ clerkId: "clerk_vol_fo", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_fo")

    await expect(createFeedingOverride(baseline.id, horse.id, formData({ reason: "vet visit" }))).rejects.toThrow("Not authorized")
    expect(await prisma.feedingOverride.count()).toBe(0)
  })

  it("lets a Shift Lead log an override for today, tied to the volunteer who logged it", async () => {
    const horse = await createHorse()
    const feedType = await getFeedType()
    const baseline = await prisma.feedingBaseline.create({
      data: { horseId: horse.id, feedTypeId: feedType.id, shift: "AM", amount: "1" }
    })
    const lead = await createVolunteer({ clerkId: "clerk_lead_fo", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_fo")

    const url = await captureRedirect(() =>
      createFeedingOverride(baseline.id, horse.id, formData({ amount: "0.5", reason: "vet-directed reduction" }))
    )

    expect(url).toBe(`/horses/${horse.id}`)
    const override = await prisma.feedingOverride.findFirstOrThrow({ where: { feedingBaselineId: baseline.id } })
    expect(override.amount?.toString()).toBe("0.5")
    expect(override.reason).toBe("vet-directed reduction")
    expect(override.changedBy).toBe(lead.id)
  })

  it("stores a null amount when the override only carries a reason (e.g. a skipped feed)", async () => {
    const horse = await createHorse()
    const feedType = await getFeedType()
    const baseline = await prisma.feedingBaseline.create({
      data: { horseId: horse.id, feedTypeId: feedType.id, shift: "AM", amount: "1" }
    })
    await createVolunteer({ clerkId: "clerk_admin_fo", role: "ADMIN" })
    mockSignedInAs("clerk_admin_fo")

    await captureRedirect(() => createFeedingOverride(baseline.id, horse.id, formData({ reason: "skipped, colic watch" })))

    const override = await prisma.feedingOverride.findFirstOrThrow({ where: { feedingBaselineId: baseline.id } })
    expect(override.amount).toBeNull()
    expect(override.reason).toBe("skipped, colic watch")
  })
})
