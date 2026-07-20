import { describe, it, expect } from "vitest"
import { createAnimalRelationship } from "@/app/animals/[id]/relationship-actions"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs } from "../helpers/auth-mock"
import { createAnimal, createVolunteer } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

describe("createAnimalRelationship", () => {
  it("is rejected for a plain Volunteer", async () => {
    const guinness = await createAnimal({ name: "Guinness" })
    const rowan = await createAnimal({ name: "Rowan" })
    await createVolunteer({ clerkId: "clerk_vol_ar1", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_ar1")

    await expect(
      createAnimalRelationship(guinness.id, formData({ relatedAnimalId: rowan.id, relationType: "SIRE_OF" }))
    ).rejects.toThrow("Not authorized")
    expect(await prisma.animalRelationship.count()).toBe(0)
  })

  it("succeeds for a Shift Lead and writes ChangeLog rows (tracked model, confirmed with James)", async () => {
    const guinness = await createAnimal({ name: "Guinness" })
    const rowan = await createAnimal({ name: "Rowan" })
    const lead = await createVolunteer({ clerkId: "clerk_lead_ar1", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_ar1")

    const url = await captureRedirect(() =>
      createAnimalRelationship(guinness.id, formData({ relatedAnimalId: rowan.id, relationType: "SIRE_OF", notes: "confirmed by intake paperwork" }))
    )
    expect(url).toBe(`/animals/${guinness.id}`)

    const row = await prisma.animalRelationship.findFirstOrThrow({ where: { animalId: guinness.id, relatedAnimalId: rowan.id } })
    expect(row.relationType).toBe("SIRE_OF")
    expect(row.recordedById).toBe(lead.id)

    const entries = await prisma.changeLog.findMany({ where: { entityType: "AnimalRelationship", entityId: row.id } })
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every((e) => e.action === "CREATE")).toBe(true)
  })

  it("succeeds for an Admin", async () => {
    const a = await createAnimal({ name: "SiblingA" })
    const b = await createAnimal({ name: "SiblingB" })
    await createVolunteer({ clerkId: "clerk_admin_ar1", role: "ADMIN" })
    mockSignedInAs("clerk_admin_ar1")

    await captureRedirect(() => createAnimalRelationship(a.id, formData({ relatedAnimalId: b.id, relationType: "SIBLING_OF" })))

    expect(await prisma.animalRelationship.count()).toBe(1)
  })

  it("rejects an animal being related to itself", async () => {
    const animal = await createAnimal({ name: "SelfRef" })
    await createVolunteer({ clerkId: "clerk_admin_ar2", role: "ADMIN" })
    mockSignedInAs("clerk_admin_ar2")

    await expect(
      createAnimalRelationship(animal.id, formData({ relatedAnimalId: animal.id, relationType: "SIBLING_OF" }))
    ).rejects.toThrow("cannot be related to itself")
  })
})
