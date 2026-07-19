import { describe, it, expect } from "vitest"
import { createWeightEntry, createAnimalMetric } from "@/app/animals/[id]/metrics-actions"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs } from "../helpers/auth-mock"
import { createAnimal, createVolunteer, getMetricType } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

describe("createWeightEntry", () => {
  it("is Admin or Shift Lead — a plain Volunteer is rejected", async () => {
    const animal = await createAnimal()
    await createVolunteer({ clerkId: "clerk_vol_we", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_we")

    await expect(createWeightEntry(animal.id, formData({ weight: "950", context: "ROUTINE" }))).rejects.toThrow("Not authorized")
    expect(await prisma.weightEntry.count()).toBe(0)
  })

  it("logs a routine weigh-in attributed to the Shift Lead who recorded it", async () => {
    const animal = await createAnimal()
    const lead = await createVolunteer({ clerkId: "clerk_lead_we", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_we")

    await captureRedirect(() => createWeightEntry(animal.id, formData({ weight: "1024.5", context: "ROUTINE" })))

    const entry = await prisma.weightEntry.findFirstOrThrow({ where: { animalId: animal.id } })
    expect(entry.weight.toString()).toBe("1024.5")
    expect(entry.context).toBe("ROUTINE")
    expect(entry.recordedBy).toBe(lead.id)
  })

  it("logs an ad hoc assessment weigh-in", async () => {
    const animal = await createAnimal()
    await createVolunteer({ clerkId: "clerk_admin_we", role: "ADMIN" })
    mockSignedInAs("clerk_admin_we")

    await captureRedirect(() => createWeightEntry(animal.id, formData({ weight: "800", context: "ASSESSMENT" })))

    const entry = await prisma.weightEntry.findFirstOrThrow({ where: { animalId: animal.id } })
    expect(entry.context).toBe("ASSESSMENT")
  })
})

describe("createAnimalMetric", () => {
  it("is Admin or Shift Lead — a plain Volunteer is rejected", async () => {
    const animal = await createAnimal()
    const metricType = await getMetricType("Henneke Body Condition Score")
    await createVolunteer({ clerkId: "clerk_vol_hm", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_hm")

    await expect(createAnimalMetric(animal.id, formData({ metricTypeId: metricType.id, value: "5" }))).rejects.toThrow("Not authorized")
    expect(await prisma.animalMetric.count()).toBe(0)
  })

  it("logs a half-point Henneke BCS score", async () => {
    const animal = await createAnimal()
    const metricType = await getMetricType("Henneke Body Condition Score")
    const lead = await createVolunteer({ clerkId: "clerk_lead_hm", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_hm")

    await captureRedirect(() => createAnimalMetric(animal.id, formData({ metricTypeId: metricType.id, value: "4.5", notes: "ribs easily felt" })))

    const metric = await prisma.animalMetric.findFirstOrThrow({ where: { animalId: animal.id } })
    expect(metric.value.toString()).toBe("4.5")
    expect(metric.recordedBy).toBe(lead.id)
    expect(metric.notes).toBe("ribs easily felt")
  })

  it("logs a height metric stored as hands.inches notation, not converted", async () => {
    const animal = await createAnimal()
    const metricType = await getMetricType("Height")
    await createVolunteer({ clerkId: "clerk_admin_hm", role: "ADMIN" })
    mockSignedInAs("clerk_admin_hm")

    await captureRedirect(() => createAnimalMetric(animal.id, formData({ metricTypeId: metricType.id, value: "15.2" })))

    const metric = await prisma.animalMetric.findFirstOrThrow({ where: { animalId: animal.id } })
    expect(metric.value.toString()).toBe("15.2")
  })
})
