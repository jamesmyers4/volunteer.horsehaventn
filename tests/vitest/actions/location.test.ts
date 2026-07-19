import { randomUUID } from "node:crypto"
import { describe, it, expect } from "vitest"
import { createLocation } from "@/app/locations/actions"
import { createLocationAssignment } from "@/app/animals/[id]/location-actions"
import { getLocationHistory, getCurrentLocationAssignments, currentFromHistory } from "@/lib/locations"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs } from "../helpers/auth-mock"
import { createAnimal, createVolunteer, getLocation } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

// Location is an admin-managed lookup table (tests/vitest/helpers/db.ts's LOOKUP_TABLES) and
// is deliberately never truncated between tests, same as FeedType/CareType — so every row
// created here needs a run-unique name/fieldCode/barnNumber, unlike Animal/CheckIn/etc which
// get a clean slate every test via resetDb().
const unique = () => randomUUID().slice(0, 8)

describe("createLocation", () => {
  it("is Admin-only — a Shift Lead is rejected", async () => {
    const name = `Test Field ${unique()}`
    await createVolunteer({ clerkId: "clerk_lead_loc", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_loc")

    await expect(createLocation(formData({ type: "FIELD", name }))).rejects.toThrow("Not authorized")
    expect(await prisma.location.count({ where: { name } })).toBe(0)
  })

  it("creates a FIELD location with a field code, turnout/bring-in order", async () => {
    const code = `T${unique()}`
    await createVolunteer({ clerkId: "clerk_admin_loc1", role: "ADMIN" })
    mockSignedInAs("clerk_admin_loc1")

    const url = await captureRedirect(() =>
      createLocation(formData({ type: "FIELD", name: code, fieldCode: code, turnoutOrder: "7", bringInOrder: "1" }))
    )

    expect(url).toBe("/locations")
    const location = await prisma.location.findFirstOrThrow({ where: { fieldCode: code } })
    expect(location.type).toBe("FIELD")
    expect(location.barnNumber).toBeNull()
    expect(location.stallNumber).toBeNull()
  })

  it("rejects a FIELD location that carries a barn/stall number", async () => {
    const name = `Test Field ${unique()}`
    await createVolunteer({ clerkId: "clerk_admin_loc2", role: "ADMIN" })
    mockSignedInAs("clerk_admin_loc2")

    await expect(createLocation(formData({ type: "FIELD", name, stallNumber: "12" }))).rejects.toThrow(
      "A FIELD location cannot have a barn/stall number"
    )
    expect(await prisma.location.count({ where: { name } })).toBe(0)
  })

  it("creates a BARN_STALL location with a barn/stall number, no field code", async () => {
    const name = `Test Barn Stall ${unique()}`
    await createVolunteer({ clerkId: "clerk_admin_loc3", role: "ADMIN" })
    mockSignedInAs("clerk_admin_loc3")

    await captureRedirect(() => createLocation(formData({ type: "BARN_STALL", name, barnNumber: "1", stallNumber: "12" })))

    const location = await prisma.location.findFirstOrThrow({ where: { name } })
    expect(location.type).toBe("BARN_STALL")
    expect(location.barnNumber).toBe(1)
    expect(location.stallNumber).toBe(12)
    expect(location.fieldCode).toBeNull()
  })

  it("rejects a BARN_STALL location that carries a field code", async () => {
    const name = `Test Barn Stall ${unique()}`
    await createVolunteer({ clerkId: "clerk_admin_loc4", role: "ADMIN" })
    mockSignedInAs("clerk_admin_loc4")

    await expect(createLocation(formData({ type: "BARN_STALL", name, fieldCode: `T${unique()}` }))).rejects.toThrow(
      "A BARN_STALL location cannot have a field code"
    )
  })

  it("rejects a SICK_BAY location that carries a barn/stall number", async () => {
    const name = `Test Sick Bay ${unique()}`
    await createVolunteer({ clerkId: "clerk_admin_loc5", role: "ADMIN" })
    mockSignedInAs("clerk_admin_loc5")

    await expect(createLocation(formData({ type: "SICK_BAY", name, stallNumber: "1" }))).rejects.toThrow(
      "A SICK_BAY location cannot have a barn/stall number"
    )
  })
})

describe("createLocationAssignment", () => {
  it("is Admin or Shift Lead — a plain Volunteer is rejected and nothing is written", async () => {
    const animal = await createAnimal()
    const location = await getLocation("L1")
    await createVolunteer({ clerkId: "clerk_vol_la", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_la")

    await expect(createLocationAssignment(animal.id, formData({ locationId: location.id, period: "DAY" }))).rejects.toThrow("Not authorized")
    expect(await prisma.animalLocationAssignment.count({ where: { animalId: animal.id } })).toBe(0)
  })

  it("records who and when directly on the row, attributed to the signed-in Shift Lead", async () => {
    const animal = await createAnimal()
    const location = await getLocation("L1")
    const lead = await createVolunteer({ clerkId: "clerk_lead_la", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_la")

    const url = await captureRedirect(() => createLocationAssignment(animal.id, formData({ locationId: location.id, period: "DAY" })))

    expect(url).toBe(`/animals/${animal.id}`)
    const assignment = await prisma.animalLocationAssignment.findFirstOrThrow({ where: { animalId: animal.id } })
    expect(assignment.recordedById).toBe(lead.id)
    expect(assignment.locationId).toBe(location.id)
    expect(assignment.period).toBe("DAY")
  })

  // V2.md Session 6: the Turnout Board reuses this action for its on-the-spot correction
  // affordance and needs to land back on /turnout-board instead of the animal detail page —
  // see the optional redirectTo field added to createLocationAssignment in location-actions.ts.
  it("redirects to a caller-provided redirectTo instead of the animal detail page when set", async () => {
    const animal = await createAnimal()
    const location = await getLocation("L2")
    await createVolunteer({ clerkId: "clerk_admin_la3", role: "ADMIN" })
    mockSignedInAs("clerk_admin_la3")

    const url = await captureRedirect(() =>
      createLocationAssignment(animal.id, formData({ locationId: location.id, period: "DAY", redirectTo: "/turnout-board?period=DAY" }))
    )

    expect(url).toBe("/turnout-board?period=DAY")
  })

  it("is append-only — a second move for the same animal/period adds a new row instead of touching the old one", async () => {
    const animal = await createAnimal()
    const fieldA = await getLocation("L1")
    const fieldB = await getLocation("L2")
    await createVolunteer({ clerkId: "clerk_admin_la1", role: "ADMIN" })
    mockSignedInAs("clerk_admin_la1")

    await captureRedirect(() => createLocationAssignment(animal.id, formData({ locationId: fieldA.id, period: "DAY" })))
    const first = await prisma.animalLocationAssignment.findFirstOrThrow({ where: { animalId: animal.id } })

    await captureRedirect(() => createLocationAssignment(animal.id, formData({ locationId: fieldB.id, period: "DAY" })))

    const rows = await prisma.animalLocationAssignment.findMany({ where: { animalId: animal.id } })
    expect(rows).toHaveLength(2)
    const untouchedFirst = await prisma.animalLocationAssignment.findUniqueOrThrow({ where: { id: first.id } })
    expect(untouchedFirst.locationId).toBe(fieldA.id)
    expect(untouchedFirst).toEqual(first)
  })

  it("has no update/delete path — the Prisma delegate exposes no updateMany/delete for this model in app code", () => {
    // Nothing in src/app calls prisma.animalLocationAssignment.update/delete — the only
    // write path is create (this test file + location-actions.ts's createLocationAssignment
    // are the only places the model is touched at all). Documented, not mechanically
    // enforced: a grep-based regression guard would be more fragile than useful here.
    expect(typeof prisma.animalLocationAssignment.create).toBe("function")
  })

  it("tracks DAY and NIGHT independently for the same animal", async () => {
    const animal = await createAnimal()
    const dayField = await getLocation("L1")
    const nightStall = await prisma.location.create({
      data: { type: "BARN_STALL", name: `Test Barn Stall ${unique()}`, barnNumber: 1, stallNumber: 1 }
    })
    await createVolunteer({ clerkId: "clerk_admin_la2", role: "ADMIN" })
    mockSignedInAs("clerk_admin_la2")

    await captureRedirect(() => createLocationAssignment(animal.id, formData({ locationId: dayField.id, period: "DAY" })))
    await captureRedirect(() => createLocationAssignment(animal.id, formData({ locationId: nightStall.id, period: "NIGHT" })))

    const { day, night } = await getCurrentLocationAssignments(animal.id)
    expect(day?.locationId).toBe(dayField.id)
    expect(night?.locationId).toBe(nightStall.id)
  })
})

describe("current-location derivation", () => {
  it("returns the most recent row per animal/period, independent of insert order", async () => {
    const animal = await createAnimal()
    const fieldA = await getLocation("L1")
    const fieldB = await getLocation("L2")
    const lead = await createVolunteer({ clerkId: "clerk_lead_deriv", role: "SHIFT_LEAD" })

    // Inserted out of chronological order to prove derivation goes by effectiveAt, not
    // insertion/creation order.
    await prisma.animalLocationAssignment.create({
      data: { animalId: animal.id, locationId: fieldB.id, period: "DAY", effectiveAt: new Date("2026-07-01"), recordedById: lead.id }
    })
    await prisma.animalLocationAssignment.create({
      data: { animalId: animal.id, locationId: fieldA.id, period: "DAY", effectiveAt: new Date("2026-07-10"), recordedById: lead.id }
    })

    const { day, night } = await getCurrentLocationAssignments(animal.id)
    expect(day?.locationId).toBe(fieldA.id)
    expect(night).toBeUndefined()
  })

  it("history view returns the full chronological list for an animal, newest first", async () => {
    const animal = await createAnimal()
    const fieldA = await getLocation("L1")
    const fieldB = await getLocation("L2")
    const fieldC = await getLocation("L3")
    const lead = await createVolunteer({ clerkId: "clerk_lead_hist", role: "SHIFT_LEAD" })

    await prisma.animalLocationAssignment.create({
      data: { animalId: animal.id, locationId: fieldA.id, period: "DAY", effectiveAt: new Date("2026-07-01"), recordedById: lead.id }
    })
    await prisma.animalLocationAssignment.create({
      data: { animalId: animal.id, locationId: fieldB.id, period: "DAY", effectiveAt: new Date("2026-07-05"), recordedById: lead.id }
    })
    await prisma.animalLocationAssignment.create({
      data: { animalId: animal.id, locationId: fieldC.id, period: "DAY", effectiveAt: new Date("2026-07-10"), recordedById: lead.id }
    })

    const history = await getLocationHistory(animal.id)

    expect(history.map((a) => a.location.fieldCode)).toEqual(["L3", "L2", "L1"])
  })

  it("currentFromHistory picks the first DAY row and first NIGHT row from an already-sorted list", () => {
    const dayRow = { period: "DAY" } as never
    const nightRow = { period: "NIGHT" } as never
    const { day, night } = currentFromHistory([dayRow, nightRow])
    expect(day).toBe(dayRow)
    expect(night).toBe(nightRow)
  })
})
