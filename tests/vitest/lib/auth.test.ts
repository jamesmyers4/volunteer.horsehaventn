import { describe, it, expect } from "vitest"
import { getCurrentVolunteer, requireVolunteer, requireRole } from "@/lib/auth"
import { mockSignedInAs, mockSignedOut } from "../helpers/auth-mock"
import { createVolunteer } from "../helpers/factories"

describe("getCurrentVolunteer", () => {
  it("returns null when there is no Clerk session", async () => {
    mockSignedOut()
    expect(await getCurrentVolunteer()).toBeNull()
  })

  it("returns null when the Clerk user has no matching Volunteer row", async () => {
    mockSignedInAs("clerk_unlinked_user")
    expect(await getCurrentVolunteer()).toBeNull()
  })

  it("returns the Volunteer row matching the signed-in Clerk id", async () => {
    const volunteer = await createVolunteer({ clerkId: "clerk_abc", name: "Jamie Rivera" })
    mockSignedInAs("clerk_abc")
    const result = await getCurrentVolunteer()
    expect(result?.id).toBe(volunteer.id)
    expect(result?.name).toBe("Jamie Rivera")
  })
})

describe("requireVolunteer", () => {
  it("throws when there is no session", async () => {
    mockSignedOut()
    await expect(requireVolunteer()).rejects.toThrow("Not authenticated")
  })

  it("throws when the session has no matching Volunteer row", async () => {
    mockSignedInAs("clerk_ghost")
    await expect(requireVolunteer()).rejects.toThrow("Not authenticated")
  })

  it("returns the volunteer when found", async () => {
    const volunteer = await createVolunteer({ clerkId: "clerk_def" })
    mockSignedInAs("clerk_def")
    await expect(requireVolunteer()).resolves.toMatchObject({ id: volunteer.id })
  })
})

describe("requireRole", () => {
  it("throws Not authorized when the volunteer's role isn't in the allowed list", async () => {
    await createVolunteer({ clerkId: "clerk_vol", role: "VOLUNTEER" })
    mockSignedInAs("clerk_vol")
    await expect(requireRole(["ADMIN"])).rejects.toThrow("Not authorized")
  })

  it("throws Not authenticated (not Not authorized) when there's no session at all", async () => {
    mockSignedOut()
    await expect(requireRole(["ADMIN"])).rejects.toThrow("Not authenticated")
  })

  it("returns the volunteer when their role is in the allowed list", async () => {
    const volunteer = await createVolunteer({ clerkId: "clerk_admin", role: "ADMIN" })
    mockSignedInAs("clerk_admin")
    await expect(requireRole(["ADMIN", "SHIFT_LEAD"])).resolves.toMatchObject({ id: volunteer.id })
  })

  it("allows any of several permitted roles, not just the first", async () => {
    const volunteer = await createVolunteer({ clerkId: "clerk_lead", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead")
    await expect(requireRole(["ADMIN", "SHIFT_LEAD"])).resolves.toMatchObject({ id: volunteer.id })
  })
})
