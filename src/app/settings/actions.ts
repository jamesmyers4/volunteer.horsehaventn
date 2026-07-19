"use server"

import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getFarmSettings } from "@/lib/farmSettings"

// FarmSettings is a singleton (getFarmSettings() finds-or-creates it). A manual switch, not
// date-driven automation — V2.md's explicit framing: farm staff decide when to flip it
// based on daylight/weather. Not ChangeLog-tracked — same admin-config category as
// TierThreshold/Location, per CLAUDE.md's tracked-models list.
export async function updateFarmSettings(formData: FormData) {
  await requireRole(["ADMIN"])
  const activeSeason = String(formData.get("activeSeason")) as "STANDARD" | "WINTER"

  const settings = await getFarmSettings()
  await prisma.farmSettings.update({ where: { id: settings.id }, data: { activeSeason } })

  redirect("/settings")
}

// ShiftTemplate rows are edit-only, no create/delete — shiftType ties each row to the fixed
// two-value ShiftType enum (AM/PM), so the set can never grow, same precedent as
// TierThreshold's fixed four rows (src/app/tiers/actions.ts). Admin-only, same lookup-
// table-config category as TierThreshold/Location.
export async function updateShiftTemplate(templateId: string, formData: FormData) {
  await requireRole(["ADMIN"])

  const standardStartTime = String(formData.get("standardStartTime"))
  const standardEndTime = String(formData.get("standardEndTime"))
  const winterStartTimeRaw = formData.get("winterStartTime")
  const winterEndTimeRaw = formData.get("winterEndTime")

  await prisma.shiftTemplate.update({
    where: { id: templateId },
    data: {
      standardStartTime,
      standardEndTime,
      winterStartTime: winterStartTimeRaw ? String(winterStartTimeRaw) : null,
      winterEndTime: winterEndTimeRaw ? String(winterEndTimeRaw) : null
    }
  })

  redirect("/settings")
}
