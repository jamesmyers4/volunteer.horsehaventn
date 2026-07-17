import { clerkSetup } from "@clerk/testing/playwright"
import { createClerkClient } from "@clerk/backend"
import { prisma, resetTransactionalData } from "./helpers/db"
import { TEST_USERS } from "./test-users"

async function findOrCreateClerkUser(email: string, name: string) {
  const secretKey = process.env.CLERK_SECRET_KEY
  if (!secretKey) throw new Error("CLERK_SECRET_KEY is required to provision E2E test users")
  const clerkClient = createClerkClient({ secretKey })

  const existing = await clerkClient.users.getUserList({ emailAddress: [email] })
  if (existing.data.length > 0) return existing.data[0]

  const [firstName, ...rest] = name.split(" ")
  return clerkClient.users.createUser({
    emailAddress: [email],
    firstName,
    lastName: rest.join(" ") || undefined,
    skipPasswordRequirement: true
  })
}

export default async function globalSetup() {
  // clerkSetup fetches a testing token from the Clerk Backend API, used to bypass bot
  // protection on Frontend API requests made during clerk.signIn() in each spec. dotenv:
  // false because env vars are already loaded by `npm run test:e2e` (dotenv -e .env.test -e
  // .env), and clerkSetup's own dotenv pass only reads .env.local/.env, never .env.test.
  await clerkSetup({ dotenv: false })

  for (const testUser of Object.values(TEST_USERS)) {
    const clerkUser = await findOrCreateClerkUser(testUser.email, testUser.name)
    await prisma.volunteer.upsert({
      where: { clerkId: clerkUser.id },
      update: { role: testUser.role, status: "ACTIVE", name: testUser.name, email: testUser.email },
      create: { clerkId: clerkUser.id, role: testUser.role, status: "ACTIVE", name: testUser.name, email: testUser.email, tier: "GREEN" }
    })
  }

  // Start every run from a clean slate for everything except lookups and the volunteers above.
  await resetTransactionalData()
  await prisma.$disconnect()
}
