import { describe, it, expect } from "vitest"
import { postChatMessage } from "@/app/chat/actions"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs, mockSignedOut } from "../helpers/auth-mock"
import { createVolunteer, getChatChannel } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

describe("postChatMessage", () => {
  it("throws when not authenticated and writes nothing", async () => {
    mockSignedOut()
    const channel = await getChatChannel("BROADCAST")
    await expect(postChatMessage(formData({ channelId: channel.id, body: "hello" }))).rejects.toThrow("Not authenticated")
    expect(await prisma.chatMessage.count()).toBe(0)
  })

  it("lets any signed-in Volunteer post an ordinary (unpinned) message", async () => {
    const volunteer = await createVolunteer({ clerkId: "clerk_chat_vol1", role: "VOLUNTEER" })
    mockSignedInAs("clerk_chat_vol1")
    const channel = await getChatChannel("BROADCAST")

    const url = await captureRedirect(() => postChatMessage(formData({ channelId: channel.id, body: "See everyone Saturday" })))

    expect(url).toBe(`/chat?channelId=${channel.id}`)
    const message = await prisma.chatMessage.findFirstOrThrow({ where: { senderId: volunteer.id } })
    expect(message.body).toBe("See everyone Saturday")
    expect(message.pinned).toBe(false)
    expect(message.severity).toBeNull()
    expect(message.expiresAt).toBeNull()
  })

  it("rejects a plain Volunteer trying to set pinned = true, and writes nothing", async () => {
    await createVolunteer({ clerkId: "clerk_chat_vol2", role: "VOLUNTEER" })
    mockSignedInAs("clerk_chat_vol2")
    const channel = await getChatChannel("BROADCAST")

    await expect(postChatMessage(formData({ channelId: channel.id, body: "let me in", pinned: "on" }))).rejects.toThrow(
      "Only ADMIN can pin a message"
    )
    expect(await prisma.chatMessage.count()).toBe(0)
  })

  it("rejects a Shift Lead trying to set pinned = true — pinning is ADMIN-only, not Admin-or-Shift-Lead", async () => {
    await createVolunteer({ clerkId: "clerk_chat_lead1", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_chat_lead1")
    const channel = await getChatChannel("BROADCAST")

    await expect(postChatMessage(formData({ channelId: channel.id, body: "let me in too", pinned: "on" }))).rejects.toThrow(
      "Only ADMIN can pin a message"
    )
  })

  it("lets an Admin pin a message with severity and an expiresAt", async () => {
    const admin = await createVolunteer({ clerkId: "clerk_chat_admin1", role: "ADMIN" })
    mockSignedInAs("clerk_chat_admin1")
    const channel = await getChatChannel("BROADCAST")

    await captureRedirect(() =>
      postChatMessage(
        formData({ channelId: channel.id, body: "Farm closed Sunday for weather", pinned: "on", severity: "URGENT", expiresAt: "2026-07-21T12:00" })
      )
    )

    const message = await prisma.chatMessage.findFirstOrThrow({ where: { senderId: admin.id } })
    expect(message.pinned).toBe(true)
    expect(message.severity).toBe("URGENT")
    expect(message.expiresAt).not.toBeNull()
  })

  it("leaves severity/expiresAt null on an Admin's ordinary (unpinned) message, even if the form carried them", async () => {
    const admin = await createVolunteer({ clerkId: "clerk_chat_admin2", role: "ADMIN" })
    mockSignedInAs("clerk_chat_admin2")
    const channel = await getChatChannel("BROADCAST")

    await captureRedirect(() =>
      postChatMessage(formData({ channelId: channel.id, body: "just a normal note", severity: "URGENT", expiresAt: "2026-07-21T12:00" }))
    )

    const message = await prisma.chatMessage.findFirstOrThrow({ where: { senderId: admin.id } })
    expect(message.pinned).toBe(false)
    expect(message.severity).toBeNull()
    expect(message.expiresAt).toBeNull()
  })

  it("allows a standing pinned alert with no expiresAt", async () => {
    const admin = await createVolunteer({ clerkId: "clerk_chat_admin3", role: "ADMIN" })
    mockSignedInAs("clerk_chat_admin3")
    const channel = await getChatChannel("SHIFT", "AM")

    await captureRedirect(() => postChatMessage(formData({ channelId: channel.id, body: "Cold weather: check water heaters each AM", pinned: "on", severity: "WARNING" })))

    const message = await prisma.chatMessage.findFirstOrThrow({ where: { senderId: admin.id } })
    expect(message.pinned).toBe(true)
    expect(message.expiresAt).toBeNull()
  })
})
