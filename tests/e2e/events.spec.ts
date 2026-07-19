import { randomUUID } from "node:crypto"
import { test, expect } from "./fixtures"
import { prisma } from "./helpers/db"

const unique = () => randomUUID().slice(0, 8)

function toLocalInputValue(date: Date) {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

async function createThrowawayEvent(overrides: Partial<{ title: string; capacity: number | null; requiredTagId: string | null }> = {}) {
  const admin = await prisma.volunteer.findFirstOrThrow({ where: { name: "E2E Admin" } })
  const category = await prisma.eventCategory.findFirstOrThrow()
  const startAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  return prisma.event.create({
    data: {
      title: overrides.title ?? `Test Event ${unique()}`,
      categoryId: category.id,
      startAt,
      endAt: new Date(startAt.getTime() + 2 * 60 * 60 * 1000),
      createdById: admin.id,
      capacity: overrides.capacity,
      requiredTagId: overrides.requiredTagId
    }
  })
}

// adminPage/shiftLeadPage/volunteerPage all resolve to the same underlying `page` fixture
// within a single test (Playwright dedupes fixture dependencies), so a test that needs two
// signed-in actors at once must get the second one via openAs() — a fresh browser context —
// not by requesting two of those three fixtures together, which fails with Clerk's "You're
// already signed in" on the second sign-in attempt against the same page.
test("an Admin creates an event and a Volunteer signs up for it", async ({ adminPage, openAs }) => {
  const title = `Test Event ${unique()}`
  const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000)

  await adminPage.goto("/events")
  await adminPage.getByPlaceholder("title").fill(title)
  await adminPage.locator('select[name="categoryId"]').selectOption({ label: "Meetup" })
  await adminPage.locator('input[name="startAt"]').fill(toLocalInputValue(start))
  await adminPage.locator('input[name="endAt"]').fill(toLocalInputValue(end))
  await adminPage.getByRole("button", { name: "Add event" }).click()

  await expect(adminPage.getByRole("heading", { name: title })).toBeVisible()

  const volunteerPage = await openAs("volunteer")
  await volunteerPage.goto("/events")
  await volunteerPage.getByRole("link", { name: title }).click()
  await volunteerPage.getByRole("button", { name: "Sign up" }).click()

  await expect(volunteerPage.getByText("Your status: CONFIRMED")).toBeVisible()
  const event = await prisma.event.findFirstOrThrow({ where: { title } })
  const signup = await prisma.eventSignup.findFirstOrThrow({ where: { eventId: event.id } })
  expect(signup.status).toBe("CONFIRMED")
})

test("a Shift Lead without canScheduleEvents doesn't see the Add event form", async ({ shiftLeadPage }) => {
  await shiftLeadPage.goto("/events")

  await expect(shiftLeadPage.getByRole("button", { name: "Add event" })).not.toBeVisible()
})

test("canScheduleEvents grants event creation to a non-ADMIN volunteer", async ({ shiftLeadPage }) => {
  const shiftLead = await prisma.volunteer.findFirstOrThrow({ where: { name: "E2E Shift Lead" } })
  try {
    await prisma.volunteer.update({ where: { id: shiftLead.id }, data: { canScheduleEvents: true } })

    await shiftLeadPage.goto("/events")

    await expect(shiftLeadPage.getByRole("button", { name: "Add event" })).toBeVisible()
  } finally {
    // canScheduleEvents lives on the shared, preserved E2E Shift Lead row — restore it so
    // later tests/files see the default (false) again.
    await prisma.volunteer.update({ where: { id: shiftLead.id }, data: { canScheduleEvents: false } })
  }
})

test("capacity is enforced and canceling a confirmed signup promotes the next waitlisted volunteer", async ({ volunteerPage, openAs }) => {
  const event = await createThrowawayEvent({ capacity: 1 })
  const shiftLeadPage = await openAs("shiftLead")

  await volunteerPage.goto(`/events/${event.id}`)
  await volunteerPage.getByRole("button", { name: "Sign up" }).click()
  await expect(volunteerPage.getByText("Your status: CONFIRMED")).toBeVisible()

  await shiftLeadPage.goto(`/events/${event.id}`)
  await shiftLeadPage.getByRole("button", { name: "Sign up" }).click()
  await expect(shiftLeadPage.getByText("Your status: WAITLISTED")).toBeVisible()

  await volunteerPage.goto(`/events/${event.id}`)
  await volunteerPage.getByRole("button", { name: "Cancel my signup" }).click()
  // Wait for the cancellation's server action (including the waitlist-promotion write) to
  // actually complete before checking the other page — otherwise shiftLeadPage's reload can
  // race ahead of it, since these are two independent pages/contexts with no shared navigation
  // to wait on.
  await expect(volunteerPage.getByRole("button", { name: "Sign up" })).toBeVisible()

  await shiftLeadPage.goto(`/events/${event.id}`)
  await expect(shiftLeadPage.getByText("Your status: CONFIRMED")).toBeVisible()
})

test("a tag-gated event is hidden from an ineligible volunteer and rejects a direct signup, becoming joinable once tagged", async ({
  volunteerPage
}) => {
  const admin = await prisma.volunteer.findFirstOrThrow({ where: { name: "E2E Admin" } })
  const e2eVolunteer = await prisma.volunteer.findFirstOrThrow({ where: { name: "E2E Volunteer" } })
  const goTeam = await prisma.volunteerTag.findFirstOrThrow({ where: { name: "Go Team" } })
  const event = await createThrowawayEvent({ requiredTagId: goTeam.id })

  await volunteerPage.goto("/events")
  await expect(volunteerPage.getByText(event.title)).not.toBeVisible()

  await volunteerPage.goto(`/events/${event.id}`)
  await expect(volunteerPage.getByText("You don't meet the requirements for this event.")).toBeVisible()
  await expect(volunteerPage.getByRole("button", { name: "Sign up" })).not.toBeVisible()

  await prisma.volunteerTagAssignment.create({ data: { volunteerId: e2eVolunteer.id, tagId: goTeam.id, assignedById: admin.id } })

  await volunteerPage.goto("/events")
  await expect(volunteerPage.getByText(event.title)).toBeVisible()

  await volunteerPage.goto(`/events/${event.id}`)
  await volunteerPage.getByRole("button", { name: "Sign up" }).click()
  await expect(volunteerPage.getByText("Your status: CONFIRMED")).toBeVisible()
})

test("the event's organizer can cancel it, and the canceled event stops accepting signups", async ({ adminPage, openAs }) => {
  const event = await createThrowawayEvent()

  await adminPage.goto(`/events/${event.id}`)
  await adminPage.getByRole("button", { name: "Cancel event" }).click()

  await expect(adminPage.getByText("(canceled)")).toBeVisible()

  const volunteerPage = await openAs("volunteer")
  await volunteerPage.goto(`/events/${event.id}`)
  await expect(volunteerPage.getByRole("button", { name: "Sign up" })).not.toBeVisible()
})
