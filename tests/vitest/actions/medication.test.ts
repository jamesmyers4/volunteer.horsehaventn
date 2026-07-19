import { describe, it, expect } from "vitest"
import { createMedicationRegimen, endMedicationRegimen, logMedicationAdministered } from "@/app/animals/[id]/medication-actions"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs } from "../helpers/auth-mock"
import { createAnimal, createVolunteer } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

describe("createMedicationRegimen", () => {
  it("is Admin-only — Shift Lead is rejected", async () => {
    const animal = await createAnimal()
    await createVolunteer({ clerkId: "clerk_lead_mr", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_mr")

    await expect(
      createMedicationRegimen(animal.id, formData({ drugName: "Bute", dose: "1g", frequency: "Daily" }))
    ).rejects.toThrow("Not authorized")
    expect(await prisma.medicationRegimen.count()).toBe(0)
  })

  it("creates the regimen with today as the start date for an Admin", async () => {
    const animal = await createAnimal()
    await createVolunteer({ clerkId: "clerk_admin_mr", role: "ADMIN" })
    mockSignedInAs("clerk_admin_mr")

    const url = await captureRedirect(() =>
      createMedicationRegimen(animal.id, formData({ drugName: "Bute", dose: "1g", frequency: "Twice daily", route: "Oral, mixed in feed" }))
    )

    expect(url).toBe(`/animals/${animal.id}`)
    const regimen = await prisma.medicationRegimen.findFirstOrThrow({ where: { animalId: animal.id } })
    expect(regimen.drugName).toBe("Bute")
    expect(regimen.route).toBe("Oral, mixed in feed")
    expect(regimen.endDate).toBeNull()
  })
})

describe("endMedicationRegimen", () => {
  it("is Admin-only — Shift Lead cannot end a regimen", async () => {
    const animal = await createAnimal()
    const regimen = await prisma.medicationRegimen.create({
      data: { animalId: animal.id, drugName: "Bute", dose: "1g", frequency: "Daily", startDate: new Date("2026-01-01") }
    })
    await createVolunteer({ clerkId: "clerk_lead_er", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_er")

    await expect(endMedicationRegimen(regimen.id, animal.id)).rejects.toThrow("Not authorized")
    const unchanged = await prisma.medicationRegimen.findUniqueOrThrow({ where: { id: regimen.id } })
    expect(unchanged.endDate).toBeNull()
  })

  it("sets endDate to today for an Admin", async () => {
    const animal = await createAnimal()
    const regimen = await prisma.medicationRegimen.create({
      data: { animalId: animal.id, drugName: "Bute", dose: "1g", frequency: "Daily", startDate: new Date("2026-01-01") }
    })
    await createVolunteer({ clerkId: "clerk_admin_er", role: "ADMIN" })
    mockSignedInAs("clerk_admin_er")

    await captureRedirect(() => endMedicationRegimen(regimen.id, animal.id))

    const ended = await prisma.medicationRegimen.findUniqueOrThrow({ where: { id: regimen.id } })
    expect(ended.endDate).not.toBeNull()
    expect(ended.endDate?.toISOString().slice(0, 10)).toBe(new Date().toISOString().slice(0, 10))
  })
})

describe("logMedicationAdministered", () => {
  it("is Admin or Shift Lead — a plain Volunteer is rejected", async () => {
    const animal = await createAnimal()
    const regimen = await prisma.medicationRegimen.create({
      data: { animalId: animal.id, drugName: "Bute", dose: "1g", frequency: "Daily", startDate: new Date("2026-01-01") }
    })
    await createVolunteer({ clerkId: "clerk_vol_ml", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_ml")

    await expect(logMedicationAdministered(regimen.id, animal.id, formData({ administered: "true" }))).rejects.toThrow("Not authorized")
    expect(await prisma.medicationLog.count()).toBe(0)
  })

  it("logs a given dose, attributed to the Shift Lead who logged it", async () => {
    const animal = await createAnimal()
    const regimen = await prisma.medicationRegimen.create({
      data: { animalId: animal.id, drugName: "Bute", dose: "1g", frequency: "Daily", startDate: new Date("2026-01-01") }
    })
    const lead = await createVolunteer({ clerkId: "clerk_lead_ml", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_ml")

    await captureRedirect(() => logMedicationAdministered(regimen.id, animal.id, formData({ administered: "true", notes: "no issues" })))

    const log = await prisma.medicationLog.findFirstOrThrow({ where: { medicationRegimenId: regimen.id } })
    expect(log.administered).toBe(true)
    expect(log.administeredBy).toBe(lead.id)
    expect(log.notes).toBe("no issues")
  })

  it("logs a missed dose", async () => {
    const animal = await createAnimal()
    const regimen = await prisma.medicationRegimen.create({
      data: { animalId: animal.id, drugName: "Bute", dose: "1g", frequency: "Daily", startDate: new Date("2026-01-01") }
    })
    await createVolunteer({ clerkId: "clerk_admin_ml", role: "ADMIN" })
    mockSignedInAs("clerk_admin_ml")

    await captureRedirect(() => logMedicationAdministered(regimen.id, animal.id, formData({ administered: "false" })))

    const log = await prisma.medicationLog.findFirstOrThrow({ where: { medicationRegimenId: regimen.id } })
    expect(log.administered).toBe(false)
  })

  it("is captured in ChangeLog — MedicationLog was flagged as a prior gap in trackedModels", async () => {
    const animal = await createAnimal()
    const regimen = await prisma.medicationRegimen.create({
      data: { animalId: animal.id, drugName: "Bute", dose: "1g", frequency: "Daily", startDate: new Date("2026-01-01") }
    })
    await createVolunteer({ clerkId: "clerk_admin_ml2", role: "ADMIN" })
    mockSignedInAs("clerk_admin_ml2")

    await captureRedirect(() => logMedicationAdministered(regimen.id, animal.id, formData({ administered: "true" })))

    const log = await prisma.medicationLog.findFirstOrThrow({ where: { medicationRegimenId: regimen.id } })
    const entries = await prisma.changeLog.findMany({ where: { entityType: "MedicationLog", entityId: log.id } })
    expect(entries.length).toBeGreaterThan(0)
  })
})
