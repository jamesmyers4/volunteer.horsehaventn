import { describe, it, expect } from "vitest"
import { createIntakeGroup, updateIntakeGroup } from "@/app/intake-groups/actions"
import { assignIntakeGroup } from "@/app/animals/[id]/intake-group-actions"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs } from "../helpers/auth-mock"
import { createAnimal, createIntakeGroup as createIntakeGroupRow, createVolunteer } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

describe("createIntakeGroup / updateIntakeGroup", () => {
  it("createIntakeGroup is Admin-only", async () => {
    await createVolunteer({ clerkId: "clerk_lead_ig1", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_ig1")

    await expect(createIntakeGroup(formData({ label: "Irish Group", intakeDate: "2026-06-01" }))).rejects.toThrow("Not authorized")
    expect(await prisma.intakeGroup.count()).toBe(0)
  })

  it("creates a group and redirects to its detail page for an Admin", async () => {
    await createVolunteer({ clerkId: "clerk_admin_ig1", role: "ADMIN" })
    mockSignedInAs("clerk_admin_ig1")

    const url = await captureRedirect(() => createIntakeGroup(formData({ label: "Irish Group", intakeDate: "2026-06-01", notes: "6 animals" })))

    const group = await prisma.intakeGroup.findFirstOrThrow({ where: { label: "Irish Group" } })
    expect(url).toBe(`/intake-groups/${group.id}`)
    expect(group.notes).toBe("6 animals")
    expect(group.isActive).toBe(true)
  })

  it("updateIntakeGroup is Admin-only", async () => {
    const group = await createIntakeGroupRow({ label: "Original" })
    await createVolunteer({ clerkId: "clerk_lead_ig2", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_ig2")

    await expect(
      updateIntakeGroup(group.id, formData({ label: "Renamed", intakeDate: "2026-06-01" }))
    ).rejects.toThrow("Not authorized")
    expect((await prisma.intakeGroup.findUniqueOrThrow({ where: { id: group.id } })).label).toBe("Original")
  })

  it("deactivates a group via isActive rather than deleting it — no hard deletes", async () => {
    const group = await createIntakeGroupRow({ label: "ToDeactivate", isActive: true })
    await createVolunteer({ clerkId: "clerk_admin_ig2", role: "ADMIN" })
    mockSignedInAs("clerk_admin_ig2")

    await captureRedirect(() => updateIntakeGroup(group.id, formData({ label: "ToDeactivate", intakeDate: "2026-06-01" })))

    const stillThere = await prisma.intakeGroup.findUniqueOrThrow({ where: { id: group.id } })
    expect(stillThere.isActive).toBe(false)
  })
})

describe("assignIntakeGroup", () => {
  it("is Admin-or-Shift-Lead, not Admin-only, unlike updateAnimal's own core-field gate", async () => {
    const animal = await createAnimal({ name: "Rowan" })
    const group = await createIntakeGroupRow({ label: "Irish Group" })
    const lead = await createVolunteer({ clerkId: "clerk_lead_ig3", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_ig3")

    await captureRedirect(() => assignIntakeGroup(animal.id, formData({ intakeGroupId: group.id })))

    const updated = await prisma.animal.findUniqueOrThrow({ where: { id: animal.id } })
    expect(updated.intakeGroupId).toBe(group.id)

    const changeLogEntry = await prisma.changeLog.findFirst({
      where: { entityType: "Animal", entityId: animal.id, field: "intakeGroupId", action: "UPDATE" }
    })
    expect(changeLogEntry).toMatchObject({ newValue: group.id, changedBy: lead.id })
  })

  it("is rejected for a plain Volunteer", async () => {
    const animal = await createAnimal({ name: "Shannon" })
    const group = await createIntakeGroupRow({ label: "Irish Group" })
    await createVolunteer({ clerkId: "clerk_vol_ig3", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_ig3")

    await expect(assignIntakeGroup(animal.id, formData({ intakeGroupId: group.id }))).rejects.toThrow("Not authorized")
  })

  it("clears the group assignment when intakeGroupId is submitted blank", async () => {
    const group = await createIntakeGroupRow({ label: "Irish Group" })
    const animal = await createAnimal({ name: "Fiona", intakeGroupId: group.id })
    await createVolunteer({ clerkId: "clerk_admin_ig3", role: "ADMIN" })
    mockSignedInAs("clerk_admin_ig3")

    await captureRedirect(() => assignIntakeGroup(animal.id, formData({ intakeGroupId: "" })))

    expect((await prisma.animal.findUniqueOrThrow({ where: { id: animal.id } })).intakeGroupId).toBeNull()
  })

  it("leaves Animal.intakeGroupId nullable and unenforced — an animal can exist with no group at all", async () => {
    const animal = await createAnimal({ name: "SoloHorse" })
    expect(animal.intakeGroupId).toBeNull()
  })
})
