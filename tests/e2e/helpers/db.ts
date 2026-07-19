import { prisma } from "@/lib/prisma"

const connectionString = process.env.DATABASE_URL ?? ""
if (!/localhost|127\.0\.0\.1/.test(connectionString)) {
  throw new Error(
    `Refusing to run E2E tests: DATABASE_URL does not look like the local test database (got "${connectionString}"). ` +
      "Run via `npm run test:e2e`, which loads .env.test before .env."
  )
}

const LOOKUP_TABLES = new Set(["CredentialType", "WorkType", "FeedType", "CareType", "MetricType", "Location"])
// Unlike Vitest's resetDb (tests/vitest/helpers/db.ts), Volunteer is preserved here — the
// three seeded E2E test volunteers (test-users.ts) are provisioned once in global-setup and
// reused across the whole run, since re-linking Clerk users every test would be slow and
// pointless (their clerkId/role never change between tests).
const PRESERVED_TABLES = new Set([...LOOKUP_TABLES, "Volunteer"])

export { prisma }

export async function resetTransactionalData() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename !~ '^_prisma'
  `
  const toTruncate = tables.map((t) => t.tablename).filter((name) => !PRESERVED_TABLES.has(name))
  if (toTruncate.length === 0) return
  const identifiers = toTruncate.map((name) => `"${name}"`).join(", ")
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${identifiers} RESTART IDENTITY CASCADE`)
}
