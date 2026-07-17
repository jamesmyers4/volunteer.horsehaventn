import { describe, it, expect } from "vitest"
import { createHorse as createHorseAction, updateHorse } from "@/app/horses/actions"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs } from "../helpers/auth-mock"
import { createHorse, createVolunteer } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

const baseFields = {
  name: "Winter",
  status: "ACTIVE",
  sex: "MARE",
  requiredHandlerColor: "GREEN"
}

describe("createHorse", () => {
  it("is Admin-only — Shift Lead is rejected and nothing is written", async () => {
    await createVolunteer({ clerkId: "clerk_lead_h", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_h")
    await expect(createHorseAction(formData(baseFields))).rejects.toThrow("Not authorized")
    expect(await prisma.horse.count()).toBe(0)
  })

  it("is Admin-only — Volunteer is rejected", async () => {
    await createVolunteer({ clerkId: "clerk_vol_h", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_h")
    await expect(createHorseAction(formData(baseFields))).rejects.toThrow("Not authorized")
  })

  it("creates the horse and redirects to its detail page for an Admin", async () => {
    await createVolunteer({ clerkId: "clerk_admin_h", role: "ADMIN" })
    mockSignedInAs("clerk_admin_h")

    const url = await captureRedirect(() =>
      createHorseAction(
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

    const horse = await prisma.horse.findFirstOrThrow({ where: { name: "Winter" } })
    expect(url).toBe(`/horses/${horse.id}`)
    expect(horse.spayed).toBe(true)
    expect(horse.legalCase).toBe(true)
    expect(horse.caseReference).toBe("HH-2026-04")
    expect(horse.handlingNotes).toBe("Head-shy, approach from the left")
    expect(horse.intakeDate?.toISOString()).toContain("2026-01-05")
  })

  it("leaves optional fields null when checkboxes are unchecked and text fields blank", async () => {
    await createVolunteer({ clerkId: "clerk_admin_h2", role: "ADMIN" })
    mockSignedInAs("clerk_admin_h2")

    await captureRedirect(() => createHorseAction(formData(baseFields)))

    const horse = await prisma.horse.findFirstOrThrow({ where: { name: "Winter" } })
    expect(horse.spayed).toBe(false)
    expect(horse.legalCase).toBe(false)
    expect(horse.caseReference).toBeNull()
    expect(horse.intakeDate).toBeNull()
  })
})

describe("updateHorse", () => {
  it("is Admin-only — Shift Lead is rejected and the record is unchanged", async () => {
    const horse = await createHorse({ name: "Original" })
    await createVolunteer({ clerkId: "clerk_lead_u", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_u")

    await expect(updateHorse(horse.id, formData({ ...baseFields, name: "Renamed" }))).rejects.toThrow("Not authorized")

    const unchanged = await prisma.horse.findUniqueOrThrow({ where: { id: horse.id } })
    expect(unchanged.name).toBe("Original")
  })

  it("updates fields and logs a field-level diff for an Admin", async () => {
    const horse = await createHorse({ name: "Original", status: "ACTIVE" })
    await createVolunteer({ clerkId: "clerk_admin_u", role: "ADMIN" })
    mockSignedInAs("clerk_admin_u")

    const url = await captureRedirect(() =>
      updateHorse(horse.id, formData({ ...baseFields, name: "Renamed", status: "ADOPTED" }))
    )

    expect(url).toBe(`/horses/${horse.id}`)
    const updated = await prisma.horse.findUniqueOrThrow({ where: { id: horse.id } })
    expect(updated.name).toBe("Renamed")
    expect(updated.status).toBe("ADOPTED")

    const nameChange = await prisma.changeLog.findFirst({
      where: { entityType: "Horse", entityId: horse.id, field: "name", action: "UPDATE" }
    })
    expect(nameChange).toMatchObject({ oldValue: "Original", newValue: "Renamed" })
  })
})
