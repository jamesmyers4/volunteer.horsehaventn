import { randomUUID } from "node:crypto"
import { describe, it, expect } from "vitest"
import { prisma } from "@/lib/prisma"

// V3FIX.md: FeedType/CareType/WorkType/MetricType.name were made @unique, closing the same
// gap CredentialType.name's migration comment already flagged for these four tables — no
// constraint meant prisma/seed.ts's createMany({ skipDuplicates: true }) had nothing to
// dedupe against and silently duplicated every row on repeat seed runs.
const unique = () => randomUUID().slice(0, 8)

describe("lookup table name uniqueness", () => {
  it("rejects a duplicate FeedType.name with a unique-constraint violation", async () => {
    const name = `Test Feed ${unique()}`
    await prisma.feedType.create({ data: { name, defaultUnit: "SCOOP", category: "ADDITIVE" } })
    await expect(prisma.feedType.create({ data: { name, defaultUnit: "SCOOP", category: "ADDITIVE" } })).rejects.toMatchObject({
      code: "P2002"
    })
  })

  it("rejects a duplicate CareType.name with a unique-constraint violation", async () => {
    const name = `Test Care ${unique()}`
    await prisma.careType.create({ data: { name, category: "OTHER" } })
    await expect(prisma.careType.create({ data: { name, category: "OTHER" } })).rejects.toMatchObject({ code: "P2002" })
  })

  it("rejects a duplicate WorkType.name with a unique-constraint violation", async () => {
    const name = `Test Work ${unique()}`
    await prisma.workType.create({ data: { name } })
    await expect(prisma.workType.create({ data: { name } })).rejects.toMatchObject({ code: "P2002" })
  })

  it("rejects a duplicate MetricType.name with a unique-constraint violation", async () => {
    const name = `Test Metric ${unique()}`
    await prisma.metricType.create({ data: { name, unit: "SCORE" } })
    await expect(prisma.metricType.create({ data: { name, unit: "SCORE" } })).rejects.toMatchObject({ code: "P2002" })
  })

  it("createMany + skipDuplicates — the exact pattern prisma/seed.ts uses for these four models — is a true no-op on a repeat call, matching a second `db:seed` run", async () => {
    const feedTypeName = `Seed Sim Feed ${unique()}`
    const careTypeName = `Seed Sim Care ${unique()}`
    const workTypeName = `Seed Sim Work ${unique()}`
    const metricTypeName = `Seed Sim Metric ${unique()}`

    const runOnce = async () => {
      await prisma.feedType.createMany({ data: [{ name: feedTypeName, defaultUnit: "SCOOP", category: "ADDITIVE" }], skipDuplicates: true })
      await prisma.careType.createMany({ data: [{ name: careTypeName, category: "OTHER" }], skipDuplicates: true })
      await prisma.workType.createMany({ data: [{ name: workTypeName }], skipDuplicates: true })
      await prisma.metricType.createMany({ data: [{ name: metricTypeName, unit: "SCORE" }], skipDuplicates: true })
    }

    // First run inserts one row each; second run (the regression case — a re-seed of an
    // already-populated database) must skip all four rather than duplicating them.
    await runOnce()
    await runOnce()

    expect(await prisma.feedType.count({ where: { name: feedTypeName } })).toBe(1)
    expect(await prisma.careType.count({ where: { name: careTypeName } })).toBe(1)
    expect(await prisma.workType.count({ where: { name: workTypeName } })).toBe(1)
    expect(await prisma.metricType.count({ where: { name: metricTypeName } })).toBe(1)
  })
})
