import { describe, it, expect } from "vitest"
import { prisma, withChangeLog } from "@/lib/prisma"
import { createAnimal, createVolunteer } from "../helpers/factories"

function entriesFor(entityType: string, entityId: string) {
  return prisma.changeLog.findMany({ where: { entityType, entityId }, orderBy: { field: "asc" } })
}

describe("withChangeLog — CREATE", () => {
  it("writes one row per field, with oldValue null and action CREATE, on a tracked model", async () => {
    const animal = await withChangeLog(prisma, "changer-1", "intake").animal.create({
      data: { name: "Remus", status: "ACTIVE", sex: "GELDING" }
    })

    const entries = await entriesFor("Animal", animal.id)
    expect(entries.length).toBeGreaterThan(0)
    expect(entries.every((e) => e.action === "CREATE")).toBe(true)
    expect(entries.every((e) => e.oldValue === null)).toBe(true)
    expect(entries.every((e) => e.changedBy === "changer-1")).toBe(true)
    expect(entries.every((e) => e.note === "intake")).toBe(true)

    const nameEntry = entries.find((e) => e.field === "name")
    expect(nameEntry?.newValue).toBe("Remus")
  })

  it("excludes the id field itself from the logged fields", async () => {
    const animal = await withChangeLog(prisma, "changer-1").animal.create({ data: { name: "Aries" } })
    const entries = await entriesFor("Animal", animal.id)
    expect(entries.find((e) => e.field === "id")).toBeUndefined()
  })

  it("does not write any ChangeLog rows for a model that isn't tracked", async () => {
    const before = await prisma.changeLog.count()
    const careType = await withChangeLog(prisma, "changer-1").careType.create({
      data: { name: "Test Care Type", category: "OTHER" }
    })
    const after = await prisma.changeLog.count()
    expect(after).toBe(before)
    const entries = await entriesFor("CareType", careType.id)
    expect(entries).toHaveLength(0)
  })

  it("still returns the created row, unaffected by logging", async () => {
    const animal = await withChangeLog(prisma, "changer-1").animal.create({ data: { name: "Comet" } })
    expect(animal.name).toBe("Comet")
    expect(animal.id).toBeTruthy()
  })
})

describe("withChangeLog — UPDATE", () => {
  it("logs only the fields that actually changed, with correct old/new values", async () => {
    const animal = await prisma.animal.create({ data: { name: "Bishop", status: "ACTIVE", notes: "original" } })

    await withChangeLog(prisma, "changer-2", "correction").animal.update({
      where: { id: animal.id },
      data: { notes: "updated", status: "ACTIVE" }
    })

    const entries = await entriesFor("Animal", animal.id)
    expect(entries).toHaveLength(1)
    expect(entries[0].field).toBe("notes")
    expect(entries[0].oldValue).toBe("original")
    expect(entries[0].newValue).toBe("updated")
    expect(entries[0].action).toBe("UPDATE")
    expect(entries[0].changedBy).toBe("changer-2")
    expect(entries[0].note).toBe("correction")
  })

  it("writes nothing when the update changes no tracked field's value", async () => {
    const animal = await prisma.animal.create({ data: { name: "Nova", status: "ACTIVE" } })
    const before = await prisma.changeLog.count()

    await withChangeLog(prisma, "changer-2").animal.update({
      where: { id: animal.id },
      data: { status: "ACTIVE" }
    })

    const after = await prisma.changeLog.count()
    expect(after).toBe(before)
  })

  it("excludes updatedAt from diffing even though it changes on every write", async () => {
    const animal = await prisma.animal.create({ data: { name: "Zephyr" } })
    await withChangeLog(prisma, "changer-2").animal.update({
      where: { id: animal.id },
      data: { name: "Zephyr II" }
    })
    const entries = await entriesFor("Animal", animal.id)
    expect(entries.find((e) => e.field === "updatedAt")).toBeUndefined()
    expect(entries.map((e) => e.field)).toEqual(["name"])
  })

  it("does not write ChangeLog rows for updates on an untracked model", async () => {
    const photo = await prisma.animalPhoto.create({
      data: { animalId: (await createAnimal()).id, url: "https://example.com/a.jpg", type: "OTHER" }
    })
    const before = await prisma.changeLog.count()
    await withChangeLog(prisma, "changer-2").animalPhoto.update({
      where: { id: photo.id },
      data: { isPrimary: true }
    })
    expect(await prisma.changeLog.count()).toBe(before)
  })

  it("is append-only across multiple corrections — earlier entries are never edited", async () => {
    const animal = await prisma.animal.create({ data: { name: "Sable", notes: "v1" } })
    await withChangeLog(prisma, "changer-a").animal.update({ where: { id: animal.id }, data: { notes: "v2" } })
    await withChangeLog(prisma, "changer-b").animal.update({ where: { id: animal.id }, data: { notes: "v3" } })

    const entries = await prisma.changeLog.findMany({
      where: { entityType: "Animal", entityId: animal.id, field: "notes" },
      orderBy: { createdAt: "asc" }
    })
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ oldValue: "v1", newValue: "v2", changedBy: "changer-a" })
    expect(entries[1]).toMatchObject({ oldValue: "v2", newValue: "v3", changedBy: "changer-b" })
  })

  it("stringifies non-string field values (Decimal, boolean, null) consistently", async () => {
    const animal = await createAnimal()
    const baselineFeedType = await prisma.feedType.findFirstOrThrow({ where: { name: "Senior" } })
    const baseline = await withChangeLog(prisma, "changer-c").feedingBaseline.create({
      data: { animalId: animal.id, feedTypeId: baselineFeedType.id, shift: "AM", amount: "1.5", requiresSoaking: true }
    })
    const createEntries = await entriesFor("FeedingBaseline", baseline.id)
    expect(createEntries.find((e) => e.field === "amount")?.newValue).toBe("1.5")
    expect(createEntries.find((e) => e.field === "requiresSoaking")?.newValue).toBe("true")

    await withChangeLog(prisma, "changer-c").feedingBaseline.update({
      where: { id: baseline.id },
      data: { amount: "2", notes: null }
    })
    const updateEntries = await entriesFor("FeedingBaseline", baseline.id)
    const amountUpdate = updateEntries.find((e) => e.action === "UPDATE" && e.field === "amount")
    expect(amountUpdate?.oldValue).toBe("1.5")
    expect(amountUpdate?.newValue).toBe("2")
  })

  it("logs CREATE and UPDATE together as a full trail when queried by entity", async () => {
    const volunteer = await withChangeLog(prisma, "changer-d").volunteer.create({
      data: { name: "Pat", role: "VOLUNTEER" }
    })
    await withChangeLog(prisma, "changer-e").volunteer.update({
      where: { id: volunteer.id },
      data: { tier: "ORANGE" }
    })
    const entries = await entriesFor("Volunteer", volunteer.id)
    expect(entries.some((e) => e.action === "CREATE")).toBe(true)
    expect(entries.some((e) => e.action === "UPDATE" && e.field === "tier")).toBe(true)
  })
})

describe("withChangeLog — sanity check against factories helper", () => {
  it("createVolunteer factory bypasses the extension (no ChangeLog noise from test setup)", async () => {
    const volunteer = await createVolunteer()
    const entries = await entriesFor("Volunteer", volunteer.id)
    expect(entries).toHaveLength(0)
  })
})
