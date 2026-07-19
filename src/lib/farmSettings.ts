import { prisma } from "./prisma"

// V2.md Session 5: FarmSettings is a singleton row, enforced app-side (findFirst-or-create)
// rather than a DB constraint — same "app-side simplicity over fighting Postgres for
// rarely-changing admin-entered data" preference as everything else in this schema
// (CONTEXT.md §10). prisma/seed.ts also creates this row so a fresh DB always has one, but
// this helper is defensive regardless (e.g. a DB seeded before this session existed).
export async function getFarmSettings() {
  const existing = await prisma.farmSettings.findFirst()
  if (existing) return existing
  return prisma.farmSettings.create({ data: { activeSeason: "STANDARD" } })
}
