import { verifyWebhook } from "@clerk/nextjs/webhooks"
import type { NextRequest } from "next/server"
import { prisma, withChangeLog } from "@/lib/prisma"

export async function POST(req: NextRequest) {
  let evt
  try {
    evt = await verifyWebhook(req)
  } catch (error) {
    console.error("Clerk webhook verification failed:", error)
    return new Response("Verification failed", { status: 400 })
  }

  if (evt.type === "user.created") {
    const { id, email_addresses, first_name, last_name } = evt.data
    const email = email_addresses[0]?.email_address ?? null
    const name = [first_name, last_name].filter(Boolean).join(" ") || "Unnamed Volunteer"

    const existing = email ? await prisma.volunteer.findFirst({ where: { email, clerkId: null } }) : null

    if (existing) {
      await withChangeLog(prisma, existing.id, "Linked Clerk account to existing volunteer record").volunteer.update({
        where: { id: existing.id },
        data: { clerkId: id }
      })
    } else {
      await withChangeLog(prisma, "clerk-webhook", "New volunteer self-signup").volunteer.create({
        data: { clerkId: id, name, email, role: "VOLUNTEER", status: "ACTIVE", tier: "GREEN" }
      })
    }
  }

  if (evt.type === "user.updated") {
    const { id, email_addresses, first_name, last_name } = evt.data
    const email = email_addresses[0]?.email_address ?? null
    const name = [first_name, last_name].filter(Boolean).join(" ") || undefined
    const volunteer = await prisma.volunteer.findUnique({ where: { clerkId: id } })
    if (volunteer) {
      await withChangeLog(prisma, volunteer.id, "Synced from Clerk").volunteer.update({
        where: { clerkId: id },
        data: { email: email ?? undefined, name }
      })
    }
  }

  if (evt.type === "user.deleted") {
    const { id } = evt.data
    if (id) {
      const volunteer = await prisma.volunteer.findUnique({ where: { clerkId: id } })
      if (volunteer) {
        await withChangeLog(prisma, volunteer.id, "Clerk account deleted, unlinked and deactivated").volunteer.update({
          where: { clerkId: id },
          data: { clerkId: null, status: "INACTIVE" }
        })
      }
    }
  }

  return new Response("OK", { status: 200 })
}
