import "dotenv/config"
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

const connectionString = process.env.DIRECT_URL
if (!connectionString) throw new Error("DIRECT_URL is not set")

const adapter = new PrismaPg({ connectionString })
const prisma = new PrismaClient({ adapter })

async function main() {
  await prisma.credentialType.createMany({
    data: [
      { name: "Rabies Vaccination" },
      { name: "Volunteer Manual Acknowledgment" },
      { name: "Blue Handler Class" }
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
