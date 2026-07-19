import { randomUUID } from "node:crypto"
import { describe, it, expect } from "vitest"
import { createEventCategory, updateEventCategory } from "@/app/admin/event-categories/actions"
import { updateVolunteerRole, updateCanScheduleEvents } from "@/app/admin/volunteers/actions"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs } from "../helpers/auth-mock"
import { createVolunteer } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

// EventCategory is a lookup table (tests/vitest/helpers/db.ts) and never truncated between
// tests, same as Location/CredentialType/VolunteerTag — every row created here needs a
// run-unique name.
const unique = () => randomUUID().slice(0, 8)

describe("createEventCategory", () => {
  it("is Admin-only — a Shift Lead is rejected", async () => {
    const name = `Test Category ${unique()}`
    await createVolunteer({ clerkId: "clerk_lead_cec", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_cec")

    await expect(createEventCategory(formData({ name }))).rejects.toThrow("Not authorized")
    expect(await prisma.eventCategory.count({ where: { name } })).toBe(0)
  })

  it("creates a new category, defaulting to active", async () => {
    const name = `Test Category ${unique()}`
    await createVolunteer({ clerkId: "clerk_admin_cec", role: "ADMIN" })
    mockSignedInAs("clerk_admin_cec")

    const url = await captureRedirect(() => createEventCategory(formData({ name })))

    expect(url).toBe("/admin/event-categories")
    const category = await prisma.eventCategory.findFirstOrThrow({ where: { name } })
    expect(category.active).toBe(true)
  })
})

describe("updateEventCategory", () => {
  it("is Admin-only — a Shift Lead is rejected and nothing changes", async () => {
    const category = await prisma.eventCategory.create({ data: { name: `Test Category ${unique()}` } })
    await createVolunteer({ clerkId: "clerk_lead_uec", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_uec")

    await expect(updateEventCategory(category.id, formData({ name: "Changed", active: "on" }))).rejects.toThrow("Not authorized")
    const unchanged = await prisma.eventCategory.findUniqueOrThrow({ where: { id: category.id } })
    expect(unchanged.name).toBe(category.name)
  })

  it("lets an Admin rename a category and toggle it inactive", async () => {
    const category = await prisma.eventCategory.create({ data: { name: `Test Category ${unique()}` } })
    await createVolunteer({ clerkId: "clerk_admin_uec", role: "ADMIN" })
    mockSignedInAs("clerk_admin_uec")

    const renamed = `Renamed ${unique()}`
    const url = await captureRedirect(() => updateEventCategory(category.id, formData({ name: renamed })))

    expect(url).toBe("/admin/event-categories")
    const updated = await prisma.eventCategory.findUniqueOrThrow({ where: { id: category.id } })
    expect(updated.name).toBe(renamed)
    expect(updated.active).toBe(false)
  })
})

describe("updateVolunteerRole", () => {
  it("is Admin-only — a Shift Lead is rejected and nothing changes", async () => {
    const target = await createVolunteer({ role: "VOLUNTEER" })
    await createVolunteer({ clerkId: "clerk_lead_uvr", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_uvr")

    await expect(updateVolunteerRole(target.id, formData({ role: "ADMIN" }))).rejects.toThrow("Not authorized")
    const unchanged = await prisma.volunteer.findUniqueOrThrow({ where: { id: target.id } })
    expect(unchanged.role).toBe("VOLUNTEER")
  })

  it("lets an Admin promote a volunteer to SHIFT_LEAD, capturing the change in ChangeLog", async () => {
    const target = await createVolunteer({ role: "VOLUNTEER" })
    const admin = await createVolunteer({ clerkId: "clerk_admin_uvr", role: "ADMIN" })
    mockSignedInAs("clerk_admin_uvr")

    const url = await captureRedirect(() => updateVolunteerRole(target.id, formData({ role: "SHIFT_LEAD" })))

    expect(url).toBe("/admin/volunteers")
    const updated = await prisma.volunteer.findUniqueOrThrow({ where: { id: target.id } })
    expect(updated.role).toBe("SHIFT_LEAD")

    const entry = await prisma.changeLog.findFirstOrThrow({ where: { entityType: "Volunteer", entityId: target.id, field: "role" } })
    expect(entry.oldValue).toBe("VOLUNTEER")
    expect(entry.newValue).toBe("SHIFT_LEAD")
    expect(entry.changedBy).toBe(admin.id)
  })

  it("produces the same result a direct database role change would — this is a thin exposure of existing data, no new business logic", async () => {
    const target = await createVolunteer({ role: "VOLUNTEER" })
    await createVolunteer({ clerkId: "clerk_admin_uvr2", role: "ADMIN" })
    mockSignedInAs("clerk_admin_uvr2")

    await captureRedirect(() => updateVolunteerRole(target.id, formData({ role: "GUEST" })))

    const updated = await prisma.volunteer.findUniqueOrThrow({ where: { id: target.id } })
    expect(updated.role).toBe("GUEST")
  })
})

describe("updateCanScheduleEvents", () => {
  it("is Admin-only — a Shift Lead is rejected and nothing changes", async () => {
    const target = await createVolunteer()
    await createVolunteer({ clerkId: "clerk_lead_ucse", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_ucse")

    await expect(updateCanScheduleEvents(target.id, formData({ canScheduleEvents: "on" }))).rejects.toThrow("Not authorized")
    const unchanged = await prisma.volunteer.findUniqueOrThrow({ where: { id: target.id } })
    expect(unchanged.canScheduleEvents).toBe(false)
  })

  it("lets an Admin grant canScheduleEvents, matching what createEvent's permission check relies on", async () => {
    const target = await createVolunteer()
    await createVolunteer({ clerkId: "clerk_admin_ucse", role: "ADMIN" })
    mockSignedInAs("clerk_admin_ucse")

    await captureRedirect(() => updateCanScheduleEvents(target.id, formData({ canScheduleEvents: "on" })))

    const updated = await prisma.volunteer.findUniqueOrThrow({ where: { id: target.id } })
    expect(updated.canScheduleEvents).toBe(true)
  })

  it("lets an Admin revoke canScheduleEvents (checkbox left off in the submitted form)", async () => {
    const target = await prisma.volunteer.create({
      data: { clerkId: `clerk_target_${unique()}`, name: "Target", role: "VOLUNTEER", status: "ACTIVE", tier: "GREEN", canScheduleEvents: true }
    })
    await createVolunteer({ clerkId: "clerk_admin_ucse2", role: "ADMIN" })
    mockSignedInAs("clerk_admin_ucse2")

    await captureRedirect(() => updateCanScheduleEvents(target.id, formData({})))

    const updated = await prisma.volunteer.findUniqueOrThrow({ where: { id: target.id } })
    expect(updated.canScheduleEvents).toBe(false)
  })
})
