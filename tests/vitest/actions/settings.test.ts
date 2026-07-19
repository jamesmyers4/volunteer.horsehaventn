import { describe, it, expect, afterEach } from "vitest"
import { updateFarmSettings, updateShiftTemplate } from "@/app/settings/actions"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs } from "../helpers/auth-mock"
import { createVolunteer } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

// FarmSettings/ShiftTemplate are lookup/config rows (tests/vitest/helpers/db.ts), never
// truncated — every test here that mutates one restores it afterward, same discipline
// CLAUDE.md documents for TierThreshold/Location/VolunteerTag.
afterEach(async () => {
  const settings = await prisma.farmSettings.findFirst()
  if (settings) await prisma.farmSettings.update({ where: { id: settings.id }, data: { activeSeason: "STANDARD" } })

  const amTemplate = await prisma.shiftTemplate.findUnique({ where: { shiftType: "AM" } })
  if (amTemplate) {
    await prisma.shiftTemplate.update({
      where: { id: amTemplate.id },
      data: { standardStartTime: "09:00", standardEndTime: "11:00", winterStartTime: "10:00", winterEndTime: "12:00" }
    })
  }
})

describe("updateFarmSettings", () => {
  it("is Admin-only — a Shift Lead is rejected and nothing changes", async () => {
    await createVolunteer({ clerkId: "clerk_lead_ufs", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_ufs")

    await expect(updateFarmSettings(formData({ activeSeason: "WINTER" }))).rejects.toThrow("Not authorized")
    const settings = await prisma.farmSettings.findFirstOrThrow()
    expect(settings.activeSeason).toBe("STANDARD")
  })

  it("lets an Admin flip the active season", async () => {
    await createVolunteer({ clerkId: "clerk_admin_ufs", role: "ADMIN" })
    mockSignedInAs("clerk_admin_ufs")

    const url = await captureRedirect(() => updateFarmSettings(formData({ activeSeason: "WINTER" })))

    expect(url).toBe("/settings")
    const settings = await prisma.farmSettings.findFirstOrThrow()
    expect(settings.activeSeason).toBe("WINTER")
  })
})

describe("updateShiftTemplate", () => {
  it("is Admin-only — a Shift Lead is rejected and nothing changes", async () => {
    const template = await prisma.shiftTemplate.findUniqueOrThrow({ where: { shiftType: "AM" } })
    await createVolunteer({ clerkId: "clerk_lead_ust", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_ust")

    await expect(
      updateShiftTemplate(template.id, formData({ standardStartTime: "08:00", standardEndTime: "10:00" }))
    ).rejects.toThrow("Not authorized")
    const unchanged = await prisma.shiftTemplate.findUniqueOrThrow({ where: { id: template.id } })
    expect(unchanged.standardStartTime).toBe("09:00")
  })

  it("lets an Admin edit standard and winter times", async () => {
    const template = await prisma.shiftTemplate.findUniqueOrThrow({ where: { shiftType: "AM" } })
    await createVolunteer({ clerkId: "clerk_admin_ust", role: "ADMIN" })
    mockSignedInAs("clerk_admin_ust")

    await captureRedirect(() =>
      updateShiftTemplate(
        template.id,
        formData({ standardStartTime: "08:30", standardEndTime: "10:30", winterStartTime: "09:30", winterEndTime: "11:30" })
      )
    )

    const updated = await prisma.shiftTemplate.findUniqueOrThrow({ where: { id: template.id } })
    expect(updated.standardStartTime).toBe("08:30")
    expect(updated.winterStartTime).toBe("09:30")
  })

  it("clears winter times to null when left blank", async () => {
    const template = await prisma.shiftTemplate.findUniqueOrThrow({ where: { shiftType: "AM" } })
    await createVolunteer({ clerkId: "clerk_admin_ust2", role: "ADMIN" })
    mockSignedInAs("clerk_admin_ust2")

    await captureRedirect(() => updateShiftTemplate(template.id, formData({ standardStartTime: "09:00", standardEndTime: "11:00" })))

    const updated = await prisma.shiftTemplate.findUniqueOrThrow({ where: { id: template.id } })
    expect(updated.winterStartTime).toBeNull()
    expect(updated.winterEndTime).toBeNull()
  })
})
