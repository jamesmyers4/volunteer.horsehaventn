import { config } from "dotenv";

// Explicit .env.test, not the default .env — this script must only ever touch the
// throwaway localhost:5433 test container (docker-compose.test.yml), never the real
// Neon database .env points at.
config({ path: ".env.test" });

const databaseUrl = process.env.DATABASE_URL ?? "";
if (!databaseUrl.includes("localhost")) {
  throw new Error(
    `Refusing to run: DATABASE_URL does not point at localhost (got "${databaseUrl}"). ` +
      "This script must only run against the local test DB container, never production.",
  );
}

const { prisma } = await import("../src/lib/prisma");

const NAME = "Drover Kiosk Test Volunteer";
const EMAIL = "drover-test@volunteer-ops.example.com";

async function main() {
  let volunteer = await prisma.volunteer.findFirst({ where: { name: NAME } });
  if (!volunteer) {
    volunteer = await prisma.volunteer.create({
      data: {
        name: NAME,
        email: EMAIL,
        role: "VOLUNTEER",
        status: "ACTIVE",
        tier: "GREEN",
      },
    });
    console.log("created new volunteer");
  } else {
    console.log("volunteer already exists, reusing");
  }
  console.log(`TEST_VOLUNTEER_ID = "${volunteer.id}"`);
  console.log(`TEST_CHECKIN_CODE = "${volunteer.checkInCode}"`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
