import { prisma } from "@/lib/prisma"

// Guard against ever pointing this at a real database. TRUNCATE below is destructive,
// and dotenv-cli only overrides variables that aren't already set in the shell — if
// DATABASE_URL somehow leaked in from outside .env.test, refuse to run rather than wipe it.
const connectionString = process.env.DATABASE_URL ?? ""
if (!/localhost|127\.0\.0\.1/.test(connectionString)) {
  throw new Error(
    `Refusing to run tests: DATABASE_URL does not look like the local test database (got "${connectionString}"). ` +
      "Tests must run via `npm run test:unit`, which loads .env.test."
  )
}

// Admin-managed lookup/reference tables (CLAUDE.md's "Schema Conventions") are seeded once
// per test run via `npm run db:seed` and left alone — resetting per-test would mean every
// test that needs a FeedType/CareType/etc row has to recreate it, for no isolation benefit
// since nothing in the app ever mutates these rows through a tracked write path.
const LOOKUP_TABLES = new Set(["CredentialType", "WorkType", "FeedType", "CareType", "MetricType", "Location", "TierThreshold", "VolunteerTag"])

export { prisma }

export async function resetDb() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename !~ '^_prisma'
  `
  const toTruncate = tables.map((t) => t.tablename).filter((name) => !LOOKUP_TABLES.has(name))
  if (toTruncate.length === 0) return
  const identifiers = toTruncate.map((name) => `"${name}"`).join(", ")
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${identifiers} RESTART IDENTITY CASCADE`)
}
