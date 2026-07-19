import { describe, it, expect } from "vitest"
import { createCareEntry, createHealthIssue, resolveHealthIssue } from "@/app/animals/[id]/care-actions"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs } from "../helpers/auth-mock"
import { createAnimal, createVolunteer, getCareType } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

describe("createCareEntry", () => {
  it("is Admin or Shift Lead — a plain Volunteer is rejected", async () => {
    const animal = await createAnimal()
    const careType = await getCareType()
    await createVolunteer({ clerkId: "clerk_vol_ce", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_ce")

    await expect(createCareEntry(animal.id, formData({ careTypeId: careType.id }))).rejects.toThrow("Not authorized")
    expect(await prisma.careEntry.count()).toBe(0)
  })

  it("logs an entry attributed to the Shift Lead who performed it", async () => {
    const animal = await createAnimal()
    const careType = await getCareType("Grooming")
    const lead = await createVolunteer({ clerkId: "clerk_lead_ce", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_ce")

    const url = await captureRedirect(() => createCareEntry(animal.id, formData({ careTypeId: careType.id, notes: "brushed and picked hooves" })))

    expect(url).toBe(`/animals/${animal.id}`)
    const entry = await prisma.careEntry.findFirstOrThrow({ where: { animalId: animal.id } })
    expect(entry.performedBy).toBe(lead.id)
    expect(entry.notes).toBe("brushed and picked hooves")
    expect(entry.relatedHealthIssueId).toBeNull()
  })

  it("can be tied to an open health issue", async () => {
    const animal = await createAnimal()
    const careType = await getCareType("Wound Check")
    await createVolunteer({ clerkId: "clerk_admin_ce", role: "ADMIN" })
    mockSignedInAs("clerk_admin_ce")
    const issue = await prisma.healthIssue.create({ data: { animalId: animal.id, description: "Left hind laceration", startDate: new Date("2026-07-01") } })

    await captureRedirect(() => createCareEntry(animal.id, formData({ careTypeId: careType.id, relatedHealthIssueId: issue.id })))

    const entry = await prisma.careEntry.findFirstOrThrow({ where: { animalId: animal.id } })
    expect(entry.relatedHealthIssueId).toBe(issue.id)
  })
})

describe("createHealthIssue", () => {
  it("is Admin or Shift Lead — a plain Volunteer is rejected", async () => {
    const animal = await createAnimal()
    await createVolunteer({ clerkId: "clerk_vol_hi", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_hi")

    await expect(createHealthIssue(animal.id, formData({ description: "Limping on right front" }))).rejects.toThrow("Not authorized")
    expect(await prisma.healthIssue.count()).toBe(0)
  })

  it("opens an active issue starting today", async () => {
    const animal = await createAnimal()
    await createVolunteer({ clerkId: "clerk_lead_hi", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_hi")

    await captureRedirect(() => createHealthIssue(animal.id, formData({ description: "Limping on right front" })))

    const issue = await prisma.healthIssue.findFirstOrThrow({ where: { animalId: animal.id } })
    expect(issue.active).toBe(true)
    expect(issue.resolvedDate).toBeNull()
    expect(issue.description).toBe("Limping on right front")
  })
})

describe("resolveHealthIssue", () => {
  it("is Admin or Shift Lead — a plain Volunteer is rejected", async () => {
    const animal = await createAnimal()
    const issue = await prisma.healthIssue.create({ data: { animalId: animal.id, description: "Cough", startDate: new Date("2026-07-01") } })
    await createVolunteer({ clerkId: "clerk_vol_rh", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_rh")

    await expect(resolveHealthIssue(issue.id, animal.id)).rejects.toThrow("Not authorized")
    const unchanged = await prisma.healthIssue.findUniqueOrThrow({ where: { id: issue.id } })
    expect(unchanged.active).toBe(true)
  })

  it("marks the issue inactive and sets resolvedDate to today", async () => {
    const animal = await createAnimal()
    const issue = await prisma.healthIssue.create({ data: { animalId: animal.id, description: "Cough", startDate: new Date("2026-07-01") } })
    await createVolunteer({ clerkId: "clerk_lead_rh", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_rh")

    await captureRedirect(() => resolveHealthIssue(issue.id, animal.id))

    const resolved = await prisma.healthIssue.findUniqueOrThrow({ where: { id: issue.id } })
    expect(resolved.active).toBe(false)
    expect(resolved.resolvedDate).not.toBeNull()
  })
})
