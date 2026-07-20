import { test, expect } from "./fixtures"
import { prisma } from "./helpers/db"
import { TEST_USERS } from "./test-users"

async function checkInVolunteer(volunteerId: string, shiftType: "AM" | "PM") {
  const workType = await prisma.workType.findFirstOrThrow({ where: { name: "Regular Shift" } })
  const shift = await prisma.shift.create({ data: { date: new Date("2026-07-20"), type: shiftType } })
  await prisma.checkIn.create({
    data: { volunteerId, shiftId: shift.id, workTypeId: workType.id, checkInAt: new Date() }
  })
}

test("pinning is ADMIN-only — a Shift Lead and a Volunteer see no pin controls, an Admin does", async ({ volunteerPage, openAs }) => {
  // A single Page only ever holds one Clerk session (fixtures.ts) — this test needs all three
  // roles active, so only one comes from a named fixture (volunteerPage) and the rest come
  // from openAs, same pattern facility-tasks.spec.ts already established for a two-actor test.
  const shiftLeadPage = await openAs("shiftLead")
  const adminPage = await openAs("admin")

  await shiftLeadPage.goto("/chat")
  await expect(shiftLeadPage.getByLabel("Pin as alert banner")).not.toBeVisible()

  await volunteerPage.goto("/chat")
  await expect(volunteerPage.getByLabel("Pin as alert banner")).not.toBeVisible()

  await adminPage.goto("/chat")
  await expect(adminPage.getByLabel("Pin as alert banner")).toBeVisible()
})

test("an Admin pins a BROADCAST alert and it banners across every authenticated view, for every role", async ({ adminPage, openAs }) => {
  const volunteerPage = await openAs("volunteer")

  await adminPage.goto("/chat")
  await adminPage.getByPlaceholder("Message").fill("Farm closed today — severe weather")
  await adminPage.getByLabel("Pin as alert banner").check()
  await adminPage.locator("select[name=severity]").selectOption("URGENT")
  await Promise.all([adminPage.waitForNavigation(), adminPage.getByRole("button", { name: "Send" }).click()])

  // /chat also echoes the new message in its own history list below, so scope this check to
  // the banner region specifically rather than a bare page-wide text match (which would match
  // both the banner and the history entry and trip Playwright's strict-mode ambiguity check).
  await expect(adminPage.getByRole("region", { name: "Live alerts" }).getByText(/Farm closed today — severe weather/)).toBeVisible()

  // A completely different page, for a completely different role — the banner is global.
  await volunteerPage.goto("/dashboard")
  await expect(volunteerPage.getByText(/Farm closed today — severe weather/)).toBeVisible()
})

test("a SHIFT-channel alert only banners for a volunteer checked into that matching shift", async ({ volunteerPage }) => {
  // Filter by the canonical seeded test user's email, not bare role — other specs (e.g.
  // admin.spec.ts's role-change/canScheduleEvents tests) create throwaway VOLUNTEER-role rows
  // that never get reverted, so a plain role filter with no orderBy risks a wrong match once
  // those accumulate within a run (the same latent bug fixed in facility-tasks.spec.ts).
  const volunteer = await prisma.volunteer.findFirstOrThrow({ where: { email: TEST_USERS.volunteer.email } })
  await checkInVolunteer(volunteer.id, "AM")

  const amChannel = await prisma.chatChannel.findFirstOrThrow({ where: { type: "SHIFT", shiftType: "AM" } })
  const pmChannel = await prisma.chatChannel.findFirstOrThrow({ where: { type: "SHIFT", shiftType: "PM" } })
  const admin = await prisma.volunteer.findFirstOrThrow({ where: { role: "ADMIN" } })
  await prisma.chatMessage.create({
    data: { channelId: amChannel.id, senderId: admin.id, body: "AM-only reminder: bring in early today", pinned: true }
  })
  await prisma.chatMessage.create({
    data: { channelId: pmChannel.id, senderId: admin.id, body: "PM-only reminder: skip the arena", pinned: true }
  })

  await volunteerPage.goto("/dashboard")
  await expect(volunteerPage.getByText(/AM-only reminder/)).toBeVisible()
  await expect(volunteerPage.getByText(/PM-only reminder/)).not.toBeVisible()
})

test("an expired pinned message doesn't banner but still shows in normal chat history", async ({ volunteerPage }) => {
  const broadcast = await prisma.chatChannel.findFirstOrThrow({ where: { type: "BROADCAST" } })
  const admin = await prisma.volunteer.findFirstOrThrow({ where: { role: "ADMIN" } })
  await prisma.chatMessage.create({
    data: {
      channelId: broadcast.id,
      senderId: admin.id,
      body: "Old expired heads-up about last week's storm",
      pinned: true,
      createdAt: new Date("2020-01-01"),
      expiresAt: new Date("2020-01-02")
    }
  })

  await volunteerPage.goto("/dashboard");
  await expect(volunteerPage.getByText(/Old expired heads-up/)).not.toBeVisible()

  await volunteerPage.goto(`/chat?channelId=${broadcast.id}`)
  await expect(volunteerPage.getByText(/Old expired heads-up/)).toBeVisible()
})

test("an unpinned message never banners but is visible in normal chat history", async ({ volunteerPage, openAs }) => {
  const adminPage = await openAs("admin")

  await volunteerPage.goto("/chat")
  await volunteerPage.getByPlaceholder("Message").fill("Just a normal chat note, not an alert")
  await Promise.all([volunteerPage.waitForNavigation(), volunteerPage.getByRole("button", { name: "Send" }).click()])

  await expect(volunteerPage.getByText(/Just a normal chat note, not an alert/)).toBeVisible()

  await adminPage.goto("/dashboard")
  await expect(adminPage.getByText(/Just a normal chat note, not an alert/)).not.toBeVisible()
})
