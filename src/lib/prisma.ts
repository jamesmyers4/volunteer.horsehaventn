import { PrismaClient } from "../generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const connectionString = process.env.DATABASE_URL
if (!connectionString) throw new Error("DATABASE_URL is not set")

const adapter = new PrismaPg({ connectionString })
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })
if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma

const trackedModels = [
  "Horse",
  "Volunteer",
  "FeedingBaseline",
  "FeedingOverride",
  "MedicationRegimen",
  "CareEntry",
  "HealthIssue",
  "WeightEntry",
  "HorseMetric",
  "PastureAssignment",
  "Placement",
  "CredentialRecord",
  "CheckIn"
] as const

type TrackedModel = (typeof trackedModels)[number]

function isTrackedModel(model: string): model is TrackedModel {
  return (trackedModels as readonly string[]).includes(model)
}

function uncapitalize(model: string) {
  return model.charAt(0).toLowerCase() + model.slice(1)
}

type Row = Record<string, unknown>

async function logCreate(base: PrismaClient, model: TrackedModel, result: Row, changedBy: string, note?: string) {
  const entityId = String(result.id)
  const fields = Object.keys(result).filter((key) => key !== "id")
  if (fields.length === 0) return
  await base.changeLog.createMany({
    data: fields.map((field) => ({
      entityType: model,
      entityId,
      field,
      oldValue: null,
      newValue: result[field] === null || result[field] === undefined ? null : String(result[field]),
      changedBy,
      note,
      action: "CREATE" as const
    }))
  })
}

async function logUpdate(base: PrismaClient, model: TrackedModel, before: Row, after: Row, changedBy: string, note?: string) {
  const entityId = String(after.id)
  const changedFields = Object.keys(after).filter((key) => {
    if (key === "updatedAt") return false
    return JSON.stringify(before[key]) !== JSON.stringify(after[key])
  })
  if (changedFields.length === 0) return
  await base.changeLog.createMany({
    data: changedFields.map((field) => ({
      entityType: model,
      entityId,
      field,
      oldValue: before[field] === null || before[field] === undefined ? null : String(before[field]),
      newValue: after[field] === null || after[field] === undefined ? null : String(after[field]),
      changedBy,
      note,
      action: "UPDATE" as const
    }))
  })
}

export function withChangeLog(base: PrismaClient, changedBy: string, note?: string) {
  return base.$extends({
    name: "changeLog",
    query: {
      $allModels: {
        async create({ model, args, query }) {
          const result = (await query(args)) as Row
          if (isTrackedModel(model)) await logCreate(base, model, result, changedBy, note)
          return result
        },
        async update({ model, args, query }) {
          let before: Row | null = null
          if (isTrackedModel(model)) {
            const delegate = (base as unknown as Record<string, { findUnique: (a: unknown) => Promise<Row | null> }>)[uncapitalize(model)]
            before = await delegate.findUnique({ where: args.where })
          }
          const result = (await query(args)) as Row
          if (isTrackedModel(model) && before) await logUpdate(base, model, before, result, changedBy, note)
          return result
        }
      }
    }
  })
}
