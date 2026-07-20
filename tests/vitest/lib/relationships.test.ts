import { describe, it, expect } from "vitest"
import { getRelationshipsForAnimal } from "@/lib/relationships"
import { prisma, withChangeLog } from "@/lib/prisma"
import { createAnimal, createVolunteer } from "../helpers/factories"

// V3.md Session 1's own worked scenario: Guinness sired both Rowan (dam: Bridgette) and
// Shannon (dam: Sorcha) — confirms an animal can carry both a sire and a dam relationship
// independently, and that the inverse direction is derived correctly for each side.
describe("getRelationshipsForAnimal", () => {
  it("derives sire/dam labels for both directions, and lets one animal hold a sire and a dam relationship at once", async () => {
    const recorder = await createVolunteer({ role: "ADMIN" })
    const guinness = await createAnimal({ name: "Guinness" })
    const rowan = await createAnimal({ name: "Rowan" })
    const shannon = await createAnimal({ name: "Shannon" })
    const bridgette = await createAnimal({ name: "Bridgette" })
    const sorcha = await createAnimal({ name: "Sorcha" })

    const cl = withChangeLog(prisma, recorder.id)
    await cl.animalRelationship.create({ data: { animalId: guinness.id, relatedAnimalId: rowan.id, relationType: "SIRE_OF", recordedById: recorder.id } })
    await cl.animalRelationship.create({ data: { animalId: guinness.id, relatedAnimalId: shannon.id, relationType: "SIRE_OF", recordedById: recorder.id } })
    await cl.animalRelationship.create({ data: { animalId: bridgette.id, relatedAnimalId: rowan.id, relationType: "DAM_OF", recordedById: recorder.id } })
    await cl.animalRelationship.create({ data: { animalId: sorcha.id, relatedAnimalId: shannon.id, relationType: "DAM_OF", recordedById: recorder.id } })

    const guinnessView = await getRelationshipsForAnimal(guinness.id)
    expect(guinnessView).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Sire of", otherAnimalName: "Rowan" }),
        expect.objectContaining({ label: "Sire of", otherAnimalName: "Shannon" })
      ])
    )

    const rowanView = await getRelationshipsForAnimal(rowan.id)
    expect(rowanView).toHaveLength(2)
    expect(rowanView).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Sire", otherAnimalName: "Guinness" }),
        expect.objectContaining({ label: "Dam", otherAnimalName: "Bridgette" })
      ])
    )

    const shannonView = await getRelationshipsForAnimal(shannon.id)
    expect(shannonView).toHaveLength(2)
    expect(shannonView).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Sire", otherAnimalName: "Guinness" }),
        expect.objectContaining({ label: "Dam", otherAnimalName: "Sorcha" })
      ])
    )
  })

  it("returns an empty list for an animal with no recorded relationships", async () => {
    const animal = await createAnimal({ name: "Loner" })
    expect(await getRelationshipsForAnimal(animal.id)).toEqual([])
  })

  it("labels SIBLING_OF the same in both directions", async () => {
    const recorder = await createVolunteer({ role: "ADMIN" })
    const a = await createAnimal({ name: "SibA" })
    const b = await createAnimal({ name: "SibB" })
    await withChangeLog(prisma, recorder.id).animalRelationship.create({
      data: { animalId: a.id, relatedAnimalId: b.id, relationType: "SIBLING_OF", recordedById: recorder.id }
    })

    expect(await getRelationshipsForAnimal(a.id)).toEqual([expect.objectContaining({ label: "Sibling of", otherAnimalName: "SibB" })])
    expect(await getRelationshipsForAnimal(b.id)).toEqual([expect.objectContaining({ label: "Sibling of", otherAnimalName: "SibA" })])
  })
})
