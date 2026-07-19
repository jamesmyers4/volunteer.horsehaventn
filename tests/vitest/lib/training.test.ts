import { randomUUID } from "node:crypto"
import { describe, it, expect } from "vitest"
import { getMissingOrExpiredRequiredTraining } from "@/lib/training"
import { prisma } from "@/lib/prisma"
import { createVolunteer } from "../helpers/factories"

const unique = () => randomUUID().slice(0, 8)

describe("getMissingOrExpiredRequiredTraining", () => {
  it("flags an active volunteer with no completion at all as missing", async () => {
    const requirement = await prisma.credentialType.create({ data: { name: `Req Missing ${unique()}`, isRequired: true, renewalPeriodDays: 365 } })
    const volunteer = await createVolunteer({ status: "ACTIVE" })

    const gaps = await getMissingOrExpiredRequiredTraining()

    const gap = gaps.find((g) => g.volunteer.id === volunteer.id && g.requirement.id === requirement.id)
    expect(gap?.status).toBe("missing")
  })

  it("flags a volunteer whose completion has passed its expiresAt as expired, not missing", async () => {
    const requirement = await prisma.credentialType.create({ data: { name: `Req Expired ${unique()}`, isRequired: true, renewalPeriodDays: 365 } })
    const volunteer = await createVolunteer({ status: "ACTIVE" })
    await prisma.credentialRecord.create({
      data: { volunteerId: volunteer.id, credentialTypeId: requirement.id, completedDate: new Date("2024-01-01"), expiresAt: new Date("2025-01-01") }
    })

    const gaps = await getMissingOrExpiredRequiredTraining(new Date("2026-07-18"))

    const gap = gaps.find((g) => g.volunteer.id === volunteer.id && g.requirement.id === requirement.id)
    expect(gap?.status).toBe("expired")
  })

  it("does not flag a volunteer with a current, unexpired completion", async () => {
    const requirement = await prisma.credentialType.create({ data: { name: `Req Current ${unique()}`, isRequired: true, renewalPeriodDays: 365 } })
    const volunteer = await createVolunteer({ status: "ACTIVE" })
    await prisma.credentialRecord.create({
      data: { volunteerId: volunteer.id, credentialTypeId: requirement.id, completedDate: new Date("2026-01-01"), expiresAt: new Date("2027-01-01") }
    })

    const gaps = await getMissingOrExpiredRequiredTraining(new Date("2026-07-18"))

    expect(gaps.find((g) => g.volunteer.id === volunteer.id && g.requirement.id === requirement.id)).toBeUndefined()
  })

  it("ignores requirements that aren't marked required", async () => {
    const requirement = await prisma.credentialType.create({ data: { name: `Req Optional ${unique()}`, isRequired: false } })
    const volunteer = await createVolunteer({ status: "ACTIVE" })

    const gaps = await getMissingOrExpiredRequiredTraining()

    expect(gaps.find((g) => g.volunteer.id === volunteer.id && g.requirement.id === requirement.id)).toBeUndefined()
  })

  it("ignores inactive volunteers", async () => {
    const requirement = await prisma.credentialType.create({ data: { name: `Req Inactive Vol ${unique()}`, isRequired: true } })
    const volunteer = await createVolunteer({ status: "INACTIVE" })

    const gaps = await getMissingOrExpiredRequiredTraining()

    expect(gaps.find((g) => g.volunteer.id === volunteer.id && g.requirement.id === requirement.id)).toBeUndefined()
  })
})
