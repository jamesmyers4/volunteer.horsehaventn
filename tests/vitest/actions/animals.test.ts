import { describe, it, expect } from "vitest"
import { createAnimal as createAnimalAction, updateAnimal } from "@/app/animals/actions"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs } from "../helpers/auth-mock"
import { createAnimal, createVolunteer } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

const baseFields = {
  name: "Winter",
  status: "ACTIVE",
  sex: "MARE",
  requiredHandlerColor: "GREEN"
}

describe("createAnimal", () => {
  it("is Admin-only — Shift Lead is rejected and nothing is written", async () => {
    await createVolunteer({ clerkId: "clerk_lead_h", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_h")
    await expect(createAnimalAction(formData(baseFields))).rejects.toThrow("Not authorized")
    expect(await prisma.animal.count()).toBe(0)
  })

  it("is Admin-only — Volunteer is rejected", async () => {
    await createVolunteer({ clerkId: "clerk_vol_h", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_h")
    await expect(createAnimalAction(formData(baseFields))).rejects.toThrow("Not authorized")
  })

  it("creates the horse and redirects to its detail page for an Admin", async () => {
    await createVolunteer({ clerkId: "clerk_admin_h", role: "ADMIN" })
    mockSignedInAs("clerk_admin_h")

    const url = await captureRedirect(() =>
      createAnimalAction(
        formData({
          ...baseFields,
          spayed: "on",
          legalCase: "on",
          caseReference: "HH-2026-04",
          intakeDate: "2026-01-05",
          handlingNotes: "Head-shy, approach from the left"
        })
      )
    )

    const animal = await prisma.animal.findFirstOrThrow({ where: { name: "Winter" } })
    expect(url).toBe(`/animals/${animal.id}`)
    expect(animal.spayed).toBe(true)
    expect(animal.legalCase).toBe(true)
    expect(animal.caseReference).toBe("HH-2026-04")
    expect(animal.handlingNotes).toBe("Head-shy, approach from the left")
    expect(animal.intakeDate?.toISOString()).toContain("2026-01-05")
  })

  it("leaves optional fields null when checkboxes are unchecked and text fields blank", async () => {
    await createVolunteer({ clerkId: "clerk_admin_h2", role: "ADMIN" })
    mockSignedInAs("clerk_admin_h2")

    await captureRedirect(() => createAnimalAction(formData(baseFields)))

    const animal = await prisma.animal.findFirstOrThrow({ where: { name: "Winter" } })
    expect(animal.spayed).toBe(false)
    expect(animal.legalCase).toBe(false)
    expect(animal.caseReference).toBeNull()
    expect(animal.intakeDate).toBeNull()
    expect(animal.herdOrder).toBeNull()
  })

  // V2.md Session 6: herdOrder drives the Turnout Board's per-field herd-hierarchy ordering
  // (lead animal at top) — see prisma/schema.prisma's comment on Animal.herdOrder for why
  // this field exists (no such field/prior decision existed before this session).
  it("persists herdOrder when set", async () => {
    await createVolunteer({ clerkId: "clerk_admin_h3", role: "ADMIN" })
    mockSignedInAs("clerk_admin_h3")

    await captureRedirect(() => createAnimalAction(formData({ ...baseFields, herdOrder: "2" })))

    const animal = await prisma.animal.findFirstOrThrow({ where: { name: "Winter" } })
    expect(animal.herdOrder).toBe(2)
  })
})

describe("updateAnimal", () => {
  it("is Admin-only — Shift Lead is rejected and the record is unchanged", async () => {
    const animal = await createAnimal({ name: "Original" })
    await createVolunteer({ clerkId: "clerk_lead_u", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_u")

    await expect(updateAnimal(animal.id, formData({ ...baseFields, name: "Renamed" }))).rejects.toThrow("Not authorized")

    const unchanged = await prisma.animal.findUniqueOrThrow({ where: { id: animal.id } })
    expect(unchanged.name).toBe("Original")
  })

  it("updates fields and logs a field-level diff for an Admin", async () => {
    const animal = await createAnimal({ name: "Original", status: "ACTIVE" })
    await createVolunteer({ clerkId: "clerk_admin_u", role: "ADMIN" })
    mockSignedInAs("clerk_admin_u")

    const url = await captureRedirect(() =>
      updateAnimal(animal.id, formData({ ...baseFields, name: "Renamed", status: "ADOPTED" }))
    )

    expect(url).toBe(`/animals/${animal.id}`)
    const updated = await prisma.animal.findUniqueOrThrow({ where: { id: animal.id } })
    expect(updated.name).toBe("Renamed")
    expect(updated.status).toBe("ADOPTED")

    const nameChange = await prisma.changeLog.findFirst({
      where: { entityType: "Animal", entityId: animal.id, field: "name", action: "UPDATE" }
    })
    expect(nameChange).toMatchObject({ oldValue: "Original", newValue: "Renamed" })
  })

  it("updates herdOrder and logs the change", async () => {
    const animal = await createAnimal({ name: "Original", status: "ACTIVE" })
    await createVolunteer({ clerkId: "clerk_admin_u2", role: "ADMIN" })
    mockSignedInAs("clerk_admin_u2")

    await captureRedirect(() => updateAnimal(animal.id, formData({ ...baseFields, name: "Renamed", herdOrder: "1" })))

    const updated = await prisma.animal.findUniqueOrThrow({ where: { id: animal.id } })
    expect(updated.herdOrder).toBe(1)

    const herdOrderChange = await prisma.changeLog.findFirst({
      where: { entityType: "Animal", entityId: animal.id, field: "herdOrder", action: "UPDATE" }
    })
    expect(herdOrderChange).toMatchObject({ oldValue: null, newValue: "1" })
  })
})
