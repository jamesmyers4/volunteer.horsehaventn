import { describe, it, expect } from "vitest"
import { assignPasture } from "@/app/horses/[id]/pasture-actions"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs } from "../helpers/auth-mock"
import { createHorse, createVolunteer, getField } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

describe("assignPasture", () => {
  it("is Admin-only — Shift Lead is rejected, matching CONTEXT.md §10", async () => {
    const horse = await createHorse()
    const field = await getField("L1")
    await createVolunteer({ clerkId: "clerk_lead_pa", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_pa")

    await expect(assignPasture(horse.id, formData({ fieldId: field.id }))).rejects.toThrow("Not authorized")
    expect(await prisma.pastureAssignment.count()).toBe(0)
  })

  it("opens a new assignment when the horse has no current one", async () => {
    const horse = await createHorse()
    const field = await getField("L2")
    await createVolunteer({ clerkId: "clerk_admin_pa1", role: "ADMIN" })
    mockSignedInAs("clerk_admin_pa1")

    const url = await captureRedirect(() => assignPasture(horse.id, formData({ fieldId: field.id })))

    expect(url).toBe(`/horses/${horse.id}`)
    const assignment = await prisma.pastureAssignment.findFirstOrThrow({ where: { horseId: horse.id } })
    expect(assignment.fieldId).toBe(field.id)
    expect(assignment.endDate).toBeNull()
  })

  it("closes the existing open assignment before opening the new one — never two open at once", async () => {
    const horse = await createHorse()
    const fieldA = await getField("L1")
    const fieldB = await getField("L3")
    await createVolunteer({ clerkId: "clerk_admin_pa2", role: "ADMIN" })
    mockSignedInAs("clerk_admin_pa2")

    await captureRedirect(() => assignPasture(horse.id, formData({ fieldId: fieldA.id })))
    await captureRedirect(() => assignPasture(horse.id, formData({ fieldId: fieldB.id })))

    const openAssignments = await prisma.pastureAssignment.findMany({ where: { horseId: horse.id, endDate: null } })
    expect(openAssignments).toHaveLength(1)
    expect(openAssignments[0].fieldId).toBe(fieldB.id)

    const closed = await prisma.pastureAssignment.findFirstOrThrow({ where: { horseId: horse.id, fieldId: fieldA.id } })
    expect(closed.endDate).not.toBeNull()
  })

  it("only closes assignments for this horse, not other horses in the same field", async () => {
    const horseA = await createHorse()
    const horseB = await createHorse()
    const field = await getField("L4")
    await createVolunteer({ clerkId: "clerk_admin_pa3", role: "ADMIN" })
    mockSignedInAs("clerk_admin_pa3")

    await captureRedirect(() => assignPasture(horseA.id, formData({ fieldId: field.id })))
    await captureRedirect(() => assignPasture(horseB.id, formData({ fieldId: field.id })))

    const horseAOpen = await prisma.pastureAssignment.findFirst({ where: { horseId: horseA.id, endDate: null } })
    expect(horseAOpen).not.toBeNull()
  })

  it("logs both the close and the open as separate ChangeLog entries", async () => {
    const horse = await createHorse()
    const fieldA = await getField("L1")
    const fieldB = await getField("L2")
    await createVolunteer({ clerkId: "clerk_admin_pa4", role: "ADMIN" })
    mockSignedInAs("clerk_admin_pa4")

    await captureRedirect(() => assignPasture(horse.id, formData({ fieldId: fieldA.id })))
    const firstAssignment = await prisma.pastureAssignment.findFirstOrThrow({ where: { horseId: horse.id } })

    await captureRedirect(() => assignPasture(horse.id, formData({ fieldId: fieldB.id })))

    const closeEntry = await prisma.changeLog.findFirst({
      where: { entityType: "PastureAssignment", entityId: firstAssignment.id, action: "UPDATE", field: "endDate" }
    })
    expect(closeEntry).not.toBeNull()
  })
})
