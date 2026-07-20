import { describe, it, expect } from "vitest"
import { createPlacement } from "@/app/animals/[id]/placement-actions"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs } from "../helpers/auth-mock"
import { createAnimal, createVolunteer } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

describe("createPlacement", () => {
  it("is Admin-only, matching Animal core-status write access", async () => {
    const animal = await createAnimal({ name: "Piper" })
    await createVolunteer({ clerkId: "clerk_lead_pl1", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_pl1")

    await expect(
      createPlacement(animal.id, formData({ adopterName: "Jane Doe", placedDate: "2026-06-01" }))
    ).rejects.toThrow("Not authorized")
    expect(await prisma.placement.count()).toBe(0)
  })

  it("creates a Placement and flips the animal's status to ADOPTED, with no placementGroupId for a solo placement", async () => {
    const animal = await createAnimal({ name: "Comet", status: "ACTIVE" })
    await createVolunteer({ clerkId: "clerk_admin_pl1", role: "ADMIN" })
    mockSignedInAs("clerk_admin_pl1")

    const url = await captureRedirect(() =>
      createPlacement(animal.id, formData({ adopterName: "Jane Doe", adopterContact: "555-1234", placedDate: "2026-06-01", notes: "great match" }))
    )
    expect(url).toBe(`/animals/${animal.id}`)

    const placement = await prisma.placement.findFirstOrThrow({ where: { animalId: animal.id } })
    expect(placement.adopterName).toBe("Jane Doe")
    expect(placement.adopterContact).toBe("555-1234")
    expect(placement.placementGroupId).toBeNull()

    const updatedAnimal = await prisma.animal.findUniqueOrThrow({ where: { id: animal.id } })
    expect(updatedAnimal.status).toBe("ADOPTED")

    // Placement and Animal are both tracked models — both writes should land in ChangeLog.
    const placementEntries = await prisma.changeLog.findMany({ where: { entityType: "Placement", entityId: placement.id } })
    expect(placementEntries.length).toBeGreaterThan(0)
    const statusEntry = await prisma.changeLog.findFirst({
      where: { entityType: "Animal", entityId: animal.id, field: "status", action: "UPDATE" }
    })
    expect(statusEntry).toMatchObject({ oldValue: "ACTIVE", newValue: "ADOPTED" })
  })

  it("co-adopts two or more animals under one shared placementGroupId, adopting all of them", async () => {
    const primary = await createAnimal({ name: "Rowan", status: "ACTIVE" })
    const sibling = await createAnimal({ name: "Shannon", status: "ACTIVE" })
    await createVolunteer({ clerkId: "clerk_admin_pl2", role: "ADMIN" })
    mockSignedInAs("clerk_admin_pl2")

    const fd = formData({ adopterName: "The Smiths", placedDate: "2026-06-10" })
    fd.append("coAdoptedAnimalIds", sibling.id)
    await captureRedirect(() => createPlacement(primary.id, fd))

    const primaryPlacement = await prisma.placement.findFirstOrThrow({ where: { animalId: primary.id } })
    const siblingPlacement = await prisma.placement.findFirstOrThrow({ where: { animalId: sibling.id } })
    expect(primaryPlacement.placementGroupId).not.toBeNull()
    expect(primaryPlacement.placementGroupId).toBe(siblingPlacement.placementGroupId)

    expect((await prisma.animal.findUniqueOrThrow({ where: { id: primary.id } })).status).toBe("ADOPTED")
    expect((await prisma.animal.findUniqueOrThrow({ where: { id: sibling.id } })).status).toBe("ADOPTED")

    // Both rows queryable together as a set via the shared token.
    const group = await prisma.placement.findMany({ where: { placementGroupId: primaryPlacement.placementGroupId! } })
    expect(group.map((p) => p.animalId).sort()).toEqual([primary.id, sibling.id].sort())
  })
})
