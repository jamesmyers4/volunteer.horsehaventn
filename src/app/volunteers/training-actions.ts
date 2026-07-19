"use server"

import { redirect } from "next/navigation"
import { requireRole, requireVolunteer } from "@/lib/auth"
import { prisma, withChangeLog } from "@/lib/prisma"

type HandlingColorInput = "GREEN" | "ORANGE" | "YELLOW" | "BLUE" | "RED"

// CredentialType is an admin-managed lookup table (same category as FeedType/CareType/
// Location) — not ChangeLog-tracked, matching that pattern.
export async function createCredentialType(formData: FormData) {
  await requireRole(["ADMIN"])

  const name = String(formData.get("name"))
  const isRequired = formData.get("isRequired") === "on"
  const renewalPeriodDaysRaw = formData.get("renewalPeriodDays")
  const appliesToTierRaw = formData.get("appliesToTier")
  const fileUrlRaw = formData.get("fileUrl")

  await prisma.credentialType.create({
    data: {
      name,
      isRequired,
      renewalPeriodDays: renewalPeriodDaysRaw ? Number(renewalPeriodDaysRaw) : undefined,
      appliesToTier: appliesToTierRaw ? (String(appliesToTierRaw) as HandlingColorInput) : undefined,
      fileUrl: fileUrlRaw ? String(fileUrlRaw) : undefined
    }
  })

  redirect("/training")
}

export async function updateCredentialType(credentialTypeId: string, formData: FormData) {
  await requireRole(["ADMIN"])

  const isRequired = formData.get("isRequired") === "on"
  const active = formData.get("active") === "on"
  const renewalPeriodDaysRaw = formData.get("renewalPeriodDays")
  const appliesToTierRaw = formData.get("appliesToTier")

  await prisma.credentialType.update({
    where: { id: credentialTypeId },
    data: {
      isRequired,
      active,
      renewalPeriodDays: renewalPeriodDaysRaw ? Number(renewalPeriodDaysRaw) : null,
      appliesToTier: appliesToTierRaw ? (String(appliesToTierRaw) as HandlingColorInput) : null
    }
  })

  redirect("/training")
}

// Self-attestation only for MVP (V2.md Session 2) — a timestamped "I read this"
// acknowledgment, no quiz, no admin verification, same as CredentialRecord's existing design
// (CONTEXT.md §7). A volunteer can only log a completion for themselves; there's no
// admin-enters-on-someone-else's-behalf path yet — flagged as a deliberate MVP scope cut in
// HANDOFF.md, not an oversight.
export async function logTrainingCompletion(credentialTypeId: string) {
  const volunteer = await requireVolunteer()
  const credentialType = await prisma.credentialType.findUniqueOrThrow({ where: { id: credentialTypeId } })

  const completedDate = new Date()
  const expiresAt = credentialType.renewalPeriodDays
    ? new Date(completedDate.getTime() + credentialType.renewalPeriodDays * 24 * 60 * 60 * 1000)
    : null

  await withChangeLog(prisma, volunteer.id, "Self-attestation").credentialRecord.create({
    data: { volunteerId: volunteer.id, credentialTypeId, completedDate, expiresAt }
  })

  redirect(`/volunteers/${volunteer.id}`)
}
