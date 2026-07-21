"use server"

import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { requireNonKioskVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import type { AlertSeverityValue } from "@/lib/alerts"

// V3.md Session 3: one action serves both ordinary chat and pinned alerts — a pinned message
// *is* the alert, not a separate model. Posting itself stays open to any signed-in volunteer
// (spec: "regular chat posting permissions elsewhere are unchanged"); only pinned = true is
// gated, and rejected server-side rather than just hidden in the UI. severity/expiresAt are
// alert-only concepts (ChatMessage's own schema comment) — forced to null unless the message
// is actually pinned, so a stray form value can't sneak severity onto ordinary chat history.
// Not wrapped in withChangeLog — ChatMessage isn't a tracked model (CLAUDE.md's tracked-models
// list), same category as AnimalPhoto/FacilityTaskCompletion: who/when is already on the row
// (senderId/createdAt) and this isn't the kind of correction-prone field ChangeLog exists for.
export async function postChatMessage(formData: FormData) {
  const volunteer = await requireNonKioskVolunteer()

  const channelId = String(formData.get("channelId"))
  const body = String(formData.get("body"))
  const pinned = formData.get("pinned") === "on"

  if (pinned && volunteer.role !== "ADMIN") {
    throw new Error("Only ADMIN can pin a message")
  }

  const severityRaw = formData.get("severity")
  const expiresAtRaw = formData.get("expiresAt")

  await prisma.chatMessage.create({
    data: {
      channelId,
      senderId: volunteer.id,
      body,
      pinned,
      severity: pinned && severityRaw ? (String(severityRaw) as AlertSeverityValue) : null,
      expiresAt: pinned && expiresAtRaw && String(expiresAtRaw).length > 0 ? new Date(String(expiresAtRaw)) : null
    }
  })

  // A pinned message needs the global banner (rendered from src/app/AlertBanner.tsx, inside
  // the root layout) to reflect it immediately — but redirect() only guarantees a fresh render
  // of the page segment it targets, not ancestor layout segments shared across the whole app.
  // Every prior Server Action in this codebase only ever needed its own destination page fresh
  // (CLAUDE.md's existing actions all redirect within a single route's own data); this is the
  // first one whose write needs to invalidate something rendered above it in the tree, so
  // revalidatePath("/", "layout") — Next's documented way to revalidate every route sharing a
  // layout — is needed here specifically, not because every action needs this going forward.
  revalidatePath("/", "layout")

  redirect(`/chat?channelId=${channelId}`)
}
