import { randomUUID } from "node:crypto"
import { describe, it, expect } from "vitest"
import { createCredentialType, updateCredentialType, logTrainingCompletion } from "@/app/volunteers/training-actions"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs, mockSignedOut } from "../helpers/auth-mock"
import { createVolunteer, getCredentialType } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

// CredentialType is a lookup table (tests/vitest/helpers/db.ts) and never truncated between
// tests, same reasoning as Location — every row created here needs a run-unique name.
const unique = () => randomUUID().slice(0, 8)

describe("createCredentialType", () => {
  it("is Admin-only — a Shift Lead is rejected", async () => {
    const name = `Test Requirement ${unique()}`
    await createVolunteer({ clerkId: "clerk_lead_ct", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_ct")

    await expect(createCredentialType(formData({ name }))).rejects.toThrow("Not authorized")
    expect(await prisma.credentialType.count({ where: { name } })).toBe(0)
  })

  it("creates a requirement with a renewal period, defaulting isRequired to false when unchecked", async () => {
    const name = `Test Requirement ${unique()}`
    await createVolunteer({ clerkId: "clerk_admin_ct1", role: "ADMIN" })
    mockSignedInAs("clerk_admin_ct1")

    const url = await captureRedirect(() => createCredentialType(formData({ name, renewalPeriodDays: "365" })))

    expect(url).toBe("/training")
    const credentialType = await prisma.credentialType.findFirstOrThrow({ where: { name } })
    expect(credentialType.isRequired).toBe(false)
    expect(credentialType.renewalPeriodDays).toBe(365)
  })

  it("creates a one-time requirement with no renewal period (never expires)", async () => {
    const name = `Test Requirement ${unique()}`
    await createVolunteer({ clerkId: "clerk_admin_ct2", role: "ADMIN" })
    mockSignedInAs("clerk_admin_ct2")

    await captureRedirect(() => createCredentialType(formData({ name })))

    const credentialType = await prisma.credentialType.findFirstOrThrow({ where: { name } })
    expect(credentialType.renewalPeriodDays).toBeNull()
  })
})

describe("updateCredentialType", () => {
  it("is Admin-only — a Shift Lead is rejected", async () => {
    const credentialType = await prisma.credentialType.create({ data: { name: `Test Requirement ${unique()}` } })
    await createVolunteer({ clerkId: "clerk_lead_uct", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_uct")

    await expect(updateCredentialType(credentialType.id, formData({ isRequired: "on" }))).rejects.toThrow("Not authorized")
    const unchanged = await prisma.credentialType.findUniqueOrThrow({ where: { id: credentialType.id } })
    expect(unchanged.isRequired).toBe(false)
  })

  it("lets an Admin toggle required/active and change the renewal period", async () => {
    const credentialType = await prisma.credentialType.create({ data: { name: `Test Requirement ${unique()}`, isRequired: false } })
    await createVolunteer({ clerkId: "clerk_admin_uct", role: "ADMIN" })
    mockSignedInAs("clerk_admin_uct")

    await captureRedirect(() => updateCredentialType(credentialType.id, formData({ isRequired: "on", active: "on", renewalPeriodDays: "180" })))

    const updated = await prisma.credentialType.findUniqueOrThrow({ where: { id: credentialType.id } })
    expect(updated.isRequired).toBe(true)
    expect(updated.renewalPeriodDays).toBe(180)
  })
})

describe("logTrainingCompletion", () => {
  it("requires a signed-in volunteer", async () => {
    mockSignedOut()
    const credentialType = await getCredentialType()

    await expect(logTrainingCompletion(credentialType.id)).rejects.toThrow("Not authenticated")
    expect(await prisma.credentialRecord.count()).toBe(0)
  })

  // V4.md Session 1: KIOSK is a shared, read-only display account — logTrainingCompletion used
  // to gate only on requireVolunteer() ("any signed-in person"), which would have let a KIOSK
  // account self-attest training it can't have actually completed.
  it("rejects a KIOSK-role account and writes nothing", async () => {
    await createVolunteer({ clerkId: "clerk_ltc_kiosk", role: "KIOSK" })
    mockSignedInAs("clerk_ltc_kiosk")
    const credentialType = await getCredentialType()

    await expect(logTrainingCompletion(credentialType.id)).rejects.toThrow("Not authorized")
    expect(await prisma.credentialRecord.count()).toBe(0)
  })

  it("is self-attestation only — the record is always attributed to the signed-in volunteer, no quiz/verification fields set", async () => {
    const volunteer = await createVolunteer({ clerkId: "clerk_vol_ltc1" })
    mockSignedInAs("clerk_vol_ltc1")
    const credentialType = await getCredentialType()

    const url = await captureRedirect(() => logTrainingCompletion(credentialType.id))

    expect(url).toBe(`/volunteers/${volunteer.id}`)
    const record = await prisma.credentialRecord.findFirstOrThrow({ where: { volunteerId: volunteer.id } })
    expect(record.volunteerId).toBe(volunteer.id)
    expect(record.score).toBeNull()
  })

  it("computes expiresAt from completedDate + the requirement's renewalPeriodDays", async () => {
    await createVolunteer({ clerkId: "clerk_vol_ltc2" })
    mockSignedInAs("clerk_vol_ltc2")
    // Volunteer Manual Acknowledgment is seeded with renewalPeriodDays: 365.
    const credentialType = await getCredentialType("Volunteer Manual Acknowledgment")

    await captureRedirect(() => logTrainingCompletion(credentialType.id))

    const record = await prisma.credentialRecord.findFirstOrThrow({ where: { credentialTypeId: credentialType.id } })
    expect(record.expiresAt).not.toBeNull()
    const daysBetween = Math.round((record.expiresAt!.getTime() - record.completedDate.getTime()) / (24 * 60 * 60 * 1000))
    expect(daysBetween).toBe(365)
  })

  it("leaves expiresAt null for a requirement with no renewal period", async () => {
    await createVolunteer({ clerkId: "clerk_vol_ltc3" })
    mockSignedInAs("clerk_vol_ltc3")
    const credentialType = await getCredentialType("Rabies Vaccination")

    await captureRedirect(() => logTrainingCompletion(credentialType.id))

    const record = await prisma.credentialRecord.findFirstOrThrow({ where: { credentialTypeId: credentialType.id } })
    expect(record.expiresAt).toBeNull()
  })
})
