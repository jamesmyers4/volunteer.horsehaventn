import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const connectionString = process.env.DIRECT_URL
if (!connectionString) throw new Error("DIRECT_URL is not set")

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  // name is now @unique (V2.md Session 2 migration), so this is a real upsert — unlike
  // createMany+skipDuplicates, which turned out to silently duplicate every row on repeat
  // seed runs since there was previously no unique constraint for it to dedupe against.
  const credentialTypes = [
    { name: "Rabies Vaccination" },
    // The one real annual compliance requirement today (V2.md Session 2) — renewalPeriodDays
    // drives auto-computed CredentialRecord.expiresAt and the missing/expired training query.
    { name: "Volunteer Manual Acknowledgment", isRequired: true, renewalPeriodDays: 365 },
    { name: "Blue Handler Class" }
  ]
  for (const credentialType of credentialTypes) {
    await prisma.credentialType.upsert({
      where: { name: credentialType.name },
      update: { isRequired: credentialType.isRequired ?? false, renewalPeriodDays: credentialType.renewalPeriodDays ?? null },
      create: credentialType
    })
  }

  // Green->Orange->Yellow->Blue tenure thresholds (V2.md Session 2). Approximate per
  // CONTEXT.md §16 pending the real written schedule from Horse Haven — admin-editable via
  // /tiers, not hardcoded, so these seed values are a starting point, not a commitment.
  await prisma.tierThreshold.createMany({
    data: [
      { tier: "GREEN", minDaysTenure: 0, requiresManualRelease: false },
      { tier: "ORANGE", minDaysTenure: 180, requiresManualRelease: false },
      { tier: "YELLOW", minDaysTenure: 365, requiresManualRelease: false },
      { tier: "BLUE", minDaysTenure: 730, requiresManualRelease: true }
    ],
    skipDuplicates: true
  })

  // V2.md Session 3: generic volunteer tagging, Go Team is the first real tag. The
  // eligibility-report threshold (minDaysSinceBlueRelease) is a starting guess, same category
  // as the RP1-RP6 turnout order below — admin-editable via /tags, not a commitment, pending
  // the real Go Team tenure requirement from Lori/Ashley.
  await prisma.volunteerTag.upsert({
    where: { name: "Go Team" },
    update: {},
    create: { name: "Go Team", description: "Off-site outreach/tabling team.", minDaysSinceBlueRelease: 180 }
  })

  // V2.md Session 4: admin-editable lookup, same category as WorkType/FeedType.
  await prisma.eventCategory.createMany({
    data: [
      { name: "Fall Festival" },
      { name: "Outreach/Tabling" },
      { name: "Meetup" },
      { name: "Training Class" },
      { name: "General Volunteer Shift" },
      { name: "Other" }
    ],
    skipDuplicates: true
  })

  await prisma.feedType.createMany({
    data: [
      { name: "Senior", defaultUnit: "SCOOP", category: "MAIN_FEED" },
      { name: "Strategy", defaultUnit: "SCOOP", category: "MAIN_FEED" },
      { name: "Alfalfa", defaultUnit: "SCOOP", category: "MAIN_FEED" },
      { name: "Hay", defaultUnit: "FLAKE", category: "HAY" },
      { name: "Omega-3 Oil", defaultUnit: "SQUIRT", category: "ADDITIVE" }
    ],
    skipDuplicates: true
  })

  await prisma.careType.createMany({
    data: [
      { name: "Wound Check", category: "MEDICAL" },
      { name: "Temperature Check", category: "MEDICAL" },
      { name: "Respiratory Check", category: "MEDICAL" },
      { name: "Castration", category: "MEDICAL" },
      { name: "Fly Mask / Spray", category: "SEASONAL" },
      { name: "Blanket Change", category: "SEASONAL" },
      { name: "Grooming", category: "GROOMING" }
    ],
    skipDuplicates: true
  })

  await prisma.workType.createMany({
    data: [
      { name: "Regular Shift" },
      { name: "Filled In" },
      { name: "Barn Cleanup" },
      { name: "Event" },
      { name: "Facilities" },
      { name: "Go Team" },
      { name: "Grooming" },
      { name: "Training" },
      { name: "Other" }
    ],
    skipDuplicates: true
  })

  await prisma.metricType.createMany({
    data: [
      { name: "Henneke Body Condition Score", unit: "SCORE" },
      { name: "Height", unit: "HANDS_IN" }
    ],
    skipDuplicates: true
  })

  const fieldCodes = [
    { code: "L1", turnoutOrder: 4, bringInOrder: 7 },
    { code: "L2", turnoutOrder: 5, bringInOrder: 6 },
    { code: "L3", turnoutOrder: 7, bringInOrder: 1 },
    { code: "L4", turnoutOrder: 3, bringInOrder: 2 },
    { code: "L4A", turnoutOrder: null, bringInOrder: null },
    { code: "L4B", turnoutOrder: null, bringInOrder: null },
    { code: "L5", turnoutOrder: 2, bringInOrder: 3 },
    { code: "L6", turnoutOrder: 1, bringInOrder: 4 },
    { code: "RP1", turnoutOrder: 6, bringInOrder: 5 },
    { code: "RP2", turnoutOrder: 6, bringInOrder: 5 },
    { code: "RP3", turnoutOrder: 6, bringInOrder: 5 },
    { code: "RP4", turnoutOrder: 6, bringInOrder: 5 },
    { code: "RP5", turnoutOrder: 6, bringInOrder: 5 },
    { code: "RP6", turnoutOrder: 6, bringInOrder: 5 }
  ]

  // V2.md Session 5: reference AM/PM shift times, seasonal (winter) variants confirmed
  // directly with James rather than guessed — AM shifts later (10:00-12:00, later sunrise),
  // PM shifts earlier (3:00-6:00, earlier sunset). Edit-only via /settings after this;
  // ShiftType is a fixed two-value enum so these two rows are the complete set.
  const shiftTemplates = [
    { shiftType: "AM" as const, name: "AM Shift", standardStartTime: "09:00", standardEndTime: "11:00", winterStartTime: "10:00", winterEndTime: "12:00" },
    { shiftType: "PM" as const, name: "PM Shift", standardStartTime: "16:00", standardEndTime: "19:00", winterStartTime: "15:00", winterEndTime: "18:00" }
  ]
  for (const template of shiftTemplates) {
    await prisma.shiftTemplate.upsert({
      where: { shiftType: template.shiftType },
      update: {},
      create: template
    })
  }

  // Singleton FarmSettings row — findFirst-or-create, same pattern getFarmSettings() uses
  // at read time (src/lib/farmSettings.ts). Seeded here too so a fresh DB always has one.
  const existingFarmSettings = await prisma.farmSettings.findFirst()
  if (!existingFarmSettings) {
    await prisma.farmSettings.create({ data: { activeSeason: "STANDARD" } })
  }

  for (const field of fieldCodes) {
    await prisma.location.upsert({
      where: { fieldCode: field.code },
      update: {},
      create: { type: "FIELD", name: field.code, fieldCode: field.code, turnoutOrder: field.turnoutOrder, bringInOrder: field.bringInOrder }
    })
  }

  console.log("Seed complete")
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
