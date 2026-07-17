import { describe, it, expect, vi, beforeEach } from "vitest"
import type { NextRequest } from "next/server"

const verifyWebhookMock = vi.hoisted(() => vi.fn())

vi.mock("@clerk/nextjs/webhooks", () => ({
  verifyWebhook: verifyWebhookMock
}))

import { POST } from "@/app/api/webhooks/clerk/route"
import { prisma } from "@/lib/prisma"
import { createVolunteer } from "../helpers/factories"

function fakeReq() {
  return {} as NextRequest
}

function userEvent(type: string, data: Record<string, unknown>) {
  return { type, data }
}

describe("POST /api/webhooks/clerk", () => {
  beforeEach(() => {
    verifyWebhookMock.mockReset()
  })

  it("returns 400 when signature verification fails, and touches no data", async () => {
    verifyWebhookMock.mockRejectedValue(new Error("bad signature"))
    const before = await prisma.volunteer.count()

    const res = await POST(fakeReq())

    expect(res.status).toBe(400)
    expect(await prisma.volunteer.count()).toBe(before)
  })

  describe("user.created", () => {
    it("links to an existing admin-entered Volunteer row matched by email", async () => {
      const existing = await prisma.volunteer.create({
        data: { name: "Prelisted Person", email: "prelisted@example.com", role: "VOLUNTEER", clerkId: null }
      })

      verifyWebhookMock.mockResolvedValue(
        userEvent("user.created", {
          id: "clerk_new_signup",
          email_addresses: [{ email_address: "prelisted@example.com" }],
          first_name: "Prelisted",
          last_name: "Person"
        })
      )

      const res = await POST(fakeReq())
      expect(res.status).toBe(200)

      const linked = await prisma.volunteer.findUniqueOrThrow({ where: { id: existing.id } })
      expect(linked.clerkId).toBe("clerk_new_signup")

      const total = await prisma.volunteer.count()
      expect(total).toBe(1)
    })

    it("creates a new Volunteer row (role VOLUNTEER, tier GREEN) when no matching pre-entered record exists", async () => {
      verifyWebhookMock.mockResolvedValue(
        userEvent("user.created", {
          id: "clerk_fresh_signup",
          email_addresses: [{ email_address: "fresh@example.com" }],
          first_name: "Fresh",
          last_name: "Signup"
        })
      )

      const res = await POST(fakeReq())
      expect(res.status).toBe(200)

      const created = await prisma.volunteer.findUniqueOrThrow({ where: { clerkId: "clerk_fresh_signup" } })
      expect(created.role).toBe("VOLUNTEER")
      expect(created.tier).toBe("GREEN")
      expect(created.status).toBe("ACTIVE")
      expect(created.name).toBe("Fresh Signup")
    })

    it("does not link to a pre-entered row that already has a clerkId (avoids double-linking)", async () => {
      await createVolunteer({ email: "already-linked@example.com", clerkId: "clerk_original" })

      verifyWebhookMock.mockResolvedValue(
        userEvent("user.created", {
          id: "clerk_second_account",
          email_addresses: [{ email_address: "already-linked@example.com" }],
          first_name: "Second",
          last_name: "Account"
        })
      )

      await POST(fakeReq())

      const total = await prisma.volunteer.count()
      expect(total).toBe(2)
      const newRow = await prisma.volunteer.findUniqueOrThrow({ where: { clerkId: "clerk_second_account" } })
      expect(newRow.email).toBe("already-linked@example.com")
    })

    it("logs the create/link through ChangeLog", async () => {
      verifyWebhookMock.mockResolvedValue(
        userEvent("user.created", {
          id: "clerk_logged_signup",
          email_addresses: [{ email_address: "logged@example.com" }],
          first_name: "Logged",
          last_name: null
        })
      )

      await POST(fakeReq())

      const volunteer = await prisma.volunteer.findUniqueOrThrow({ where: { clerkId: "clerk_logged_signup" } })
      const entries = await prisma.changeLog.findMany({ where: { entityType: "Volunteer", entityId: volunteer.id, action: "CREATE" } })
      expect(entries.length).toBeGreaterThan(0)
    })
  })

  describe("user.updated", () => {
    it("syncs name and email onto the matching Volunteer row", async () => {
      const volunteer = await createVolunteer({ clerkId: "clerk_to_update", name: "Old Name", email: "old@example.com" })

      verifyWebhookMock.mockResolvedValue(
        userEvent("user.updated", {
          id: "clerk_to_update",
          email_addresses: [{ email_address: "new@example.com" }],
          first_name: "New",
          last_name: "Name"
        })
      )

      await POST(fakeReq())

      const updated = await prisma.volunteer.findUniqueOrThrow({ where: { id: volunteer.id } })
      expect(updated.name).toBe("New Name")
      expect(updated.email).toBe("new@example.com")
    })

    it("is a silent no-op when no Volunteer row matches the clerkId", async () => {
      verifyWebhookMock.mockResolvedValue(
        userEvent("user.updated", {
          id: "clerk_unknown",
          email_addresses: [{ email_address: "unknown@example.com" }],
          first_name: "Ghost",
          last_name: null
        })
      )

      const res = await POST(fakeReq())
      expect(res.status).toBe(200)
      expect(await prisma.volunteer.count()).toBe(0)
    })
  })

  describe("user.deleted", () => {
    it("unlinks clerkId and deactivates the matching Volunteer, preserving the row (no hard delete)", async () => {
      const volunteer = await createVolunteer({ clerkId: "clerk_to_delete", status: "ACTIVE" })

      verifyWebhookMock.mockResolvedValue(userEvent("user.deleted", { id: "clerk_to_delete" }))

      await POST(fakeReq())

      const after = await prisma.volunteer.findUniqueOrThrow({ where: { id: volunteer.id } })
      expect(after.clerkId).toBeNull()
      expect(after.status).toBe("INACTIVE")
    })

    it("is a silent no-op when no Volunteer row matches the deleted clerkId", async () => {
      verifyWebhookMock.mockResolvedValue(userEvent("user.deleted", { id: "clerk_never_existed" }))
      const res = await POST(fakeReq())
      expect(res.status).toBe(200)
    })
  })
})
