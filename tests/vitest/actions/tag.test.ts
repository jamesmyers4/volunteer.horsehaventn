import { randomUUID } from "node:crypto"
import { describe, it, expect } from "vitest"
import { createVolunteerTag, updateVolunteerTag, assignTag, removeTag } from "@/app/volunteers/tag-actions"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs } from "../helpers/auth-mock"
import { createVolunteer, getVolunteerTag } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

// VolunteerTag is a lookup table (tests/vitest/helpers/db.ts) and never truncated between
// tests, same reasoning as Location/CredentialType — every row created here needs a
// run-unique name.
const unique = () => randomUUID().slice(0, 8)

describe("createVolunteerTag", () => {
  it("is Admin-only — a Shift Lead is rejected", async () => {
    const name = `Test Tag ${unique()}`
    await createVolunteer({ clerkId: "clerk_lead_cvt", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_cvt")

    await expect(createVolunteerTag(formData({ name }))).rejects.toThrow("Not authorized")
    expect(await prisma.volunteerTag.count({ where: { name } })).toBe(0)
  })

  it("creates a tag with an eligibility-report threshold", async () => {
    const name = `Test Tag ${unique()}`
    await createVolunteer({ clerkId: "clerk_admin_cvt1", role: "ADMIN" })
    mockSignedInAs("clerk_admin_cvt1")

    const url = await captureRedirect(() => createVolunteerTag(formData({ name, minDaysSinceBlueRelease: "90" })))

    expect(url).toBe("/tags")
    const tag = await prisma.volunteerTag.findFirstOrThrow({ where: { name } })
    expect(tag.minDaysSinceBlueRelease).toBe(90)
  })

  it("creates a tag with no eligibility-report threshold configured (null, not zero)", async () => {
    const name = `Test Tag ${unique()}`
    await createVolunteer({ clerkId: "clerk_admin_cvt2", role: "ADMIN" })
    mockSignedInAs("clerk_admin_cvt2")

    await captureRedirect(() => createVolunteerTag(formData({ name })))

    const tag = await prisma.volunteerTag.findFirstOrThrow({ where: { name } })
    expect(tag.minDaysSinceBlueRelease).toBeNull()
  })
})

describe("updateVolunteerTag", () => {
  it("is Admin-only — a Shift Lead is rejected", async () => {
    const tag = await prisma.volunteerTag.create({ data: { name: `Test Tag ${unique()}` } })
    await createVolunteer({ clerkId: "clerk_lead_uvt", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_uvt")

    await expect(updateVolunteerTag(tag.id, formData({ minDaysSinceBlueRelease: "999" }))).rejects.toThrow("Not authorized")
    const unchanged = await prisma.volunteerTag.findUniqueOrThrow({ where: { id: tag.id } })
    expect(unchanged.minDaysSinceBlueRelease).toBeNull()
  })

  it("lets an Admin edit the threshold and active flag, since the real Go Team requirement isn't settled yet", async () => {
    const tag = await prisma.volunteerTag.create({ data: { name: `Test Tag ${unique()}`, minDaysSinceBlueRelease: 90 } })
    await createVolunteer({ clerkId: "clerk_admin_uvt", role: "ADMIN" })
    mockSignedInAs("clerk_admin_uvt")

    await captureRedirect(() => updateVolunteerTag(tag.id, formData({ minDaysSinceBlueRelease: "365", active: "on" })))

    const updated = await prisma.volunteerTag.findUniqueOrThrow({ where: { id: tag.id } })
    expect(updated.minDaysSinceBlueRelease).toBe(365)
    expect(updated.active).toBe(true)
  })
})

describe("assignTag / removeTag", () => {
  it("assignTag is Admin or Shift Lead — a plain Volunteer is rejected and nothing is written", async () => {
    const target = await createVolunteer()
    await createVolunteer({ clerkId: "clerk_vol_at", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_at")
    const tag = await getVolunteerTag()

    await expect(assignTag(target.id, formData({ tagId: tag.id }))).rejects.toThrow("Not authorized")
    expect(await prisma.volunteerTagAssignment.count({ where: { volunteerId: target.id } })).toBe(0)
  })

  it("a Shift Lead can assign a tag, recording who and when", async () => {
    const target = await createVolunteer()
    const lead = await createVolunteer({ clerkId: "clerk_lead_at", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_at")
    const tag = await getVolunteerTag()

    const url = await captureRedirect(() => assignTag(target.id, formData({ tagId: tag.id })))

    expect(url).toBe(`/volunteers/${target.id}`)
    const assignment = await prisma.volunteerTagAssignment.findFirstOrThrow({ where: { volunteerId: target.id } })
    expect(assignment.assignedById).toBe(lead.id)
    expect(assignment.tagId).toBe(tag.id)
    expect(assignment.removedAt).toBeNull()
  })

  it("rejects assigning a tag the volunteer already actively holds", async () => {
    const target = await createVolunteer()
    await createVolunteer({ clerkId: "clerk_admin_dup", role: "ADMIN" })
    mockSignedInAs("clerk_admin_dup")
    const tag = await getVolunteerTag()

    await captureRedirect(() => assignTag(target.id, formData({ tagId: tag.id })))

    await expect(assignTag(target.id, formData({ tagId: tag.id }))).rejects.toThrow("already holds this tag")
    expect(await prisma.volunteerTagAssignment.count({ where: { volunteerId: target.id, tagId: tag.id } })).toBe(1)
  })

  it("a volunteer can hold multiple different tags at once", async () => {
    const target = await createVolunteer()
    await createVolunteer({ clerkId: "clerk_admin_multi", role: "ADMIN" })
    mockSignedInAs("clerk_admin_multi")
    const tagA = await prisma.volunteerTag.create({ data: { name: `Test Tag ${unique()}` } })
    const tagB = await prisma.volunteerTag.create({ data: { name: `Test Tag ${unique()}` } })

    await captureRedirect(() => assignTag(target.id, formData({ tagId: tagA.id })))
    await captureRedirect(() => assignTag(target.id, formData({ tagId: tagB.id })))

    const assignments = await prisma.volunteerTagAssignment.findMany({ where: { volunteerId: target.id, removedAt: null } })
    expect(assignments).toHaveLength(2)
  })

  it("removeTag is Admin or Shift Lead — a plain Volunteer is rejected and the assignment is untouched", async () => {
    const target = await createVolunteer()
    await createVolunteer({ clerkId: "clerk_admin_setup_rt", role: "ADMIN" })
    mockSignedInAs("clerk_admin_setup_rt")
    const tag = await getVolunteerTag()
    await captureRedirect(() => assignTag(target.id, formData({ tagId: tag.id })))
    const assignment = await prisma.volunteerTagAssignment.findFirstOrThrow({ where: { volunteerId: target.id } })

    await createVolunteer({ clerkId: "clerk_vol_rt", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol_rt")

    await expect(removeTag(assignment.id)).rejects.toThrow("Not authorized")
    const unchanged = await prisma.volunteerTagAssignment.findUniqueOrThrow({ where: { id: assignment.id } })
    expect(unchanged.removedAt).toBeNull()
  })

  it("removeTag soft-removes (sets removedAt/removedById), doesn't delete the row", async () => {
    const target = await createVolunteer()
    const admin = await createVolunteer({ clerkId: "clerk_admin_rt2", role: "ADMIN" })
    mockSignedInAs("clerk_admin_rt2")
    const tag = await getVolunteerTag()
    await captureRedirect(() => assignTag(target.id, formData({ tagId: tag.id })))
    const assignment = await prisma.volunteerTagAssignment.findFirstOrThrow({ where: { volunteerId: target.id } })

    const url = await captureRedirect(() => removeTag(assignment.id))

    expect(url).toBe(`/volunteers/${target.id}`)
    const removed = await prisma.volunteerTagAssignment.findUniqueOrThrow({ where: { id: assignment.id } })
    expect(removed.removedAt).not.toBeNull()
    expect(removed.removedById).toBe(admin.id)
  })

  it("rejects removing an assignment that's already removed", async () => {
    const target = await createVolunteer()
    await createVolunteer({ clerkId: "clerk_admin_rt3", role: "ADMIN" })
    mockSignedInAs("clerk_admin_rt3")
    const tag = await getVolunteerTag()
    await captureRedirect(() => assignTag(target.id, formData({ tagId: tag.id })))
    const assignment = await prisma.volunteerTagAssignment.findFirstOrThrow({ where: { volunteerId: target.id } })
    await captureRedirect(() => removeTag(assignment.id))

    await expect(removeTag(assignment.id)).rejects.toThrow("already removed")
  })

  it("after removal, the tag can be reassigned (a fresh row, not reviving the old one)", async () => {
    const target = await createVolunteer()
    await createVolunteer({ clerkId: "clerk_admin_reassign", role: "ADMIN" })
    mockSignedInAs("clerk_admin_reassign")
    const tag = await getVolunteerTag()
    await captureRedirect(() => assignTag(target.id, formData({ tagId: tag.id })))
    const first = await prisma.volunteerTagAssignment.findFirstOrThrow({ where: { volunteerId: target.id } })
    await captureRedirect(() => removeTag(first.id))

    await captureRedirect(() => assignTag(target.id, formData({ tagId: tag.id })))

    const rows = await prisma.volunteerTagAssignment.findMany({ where: { volunteerId: target.id, tagId: tag.id } })
    expect(rows).toHaveLength(2)
    const active = rows.filter((r) => !r.removedAt)
    expect(active).toHaveLength(1)
  })
})
