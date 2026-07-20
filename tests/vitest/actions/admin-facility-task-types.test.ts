import { describe, it, expect, afterEach } from "vitest"
import { updateFacilityTaskType } from "@/app/admin/facility-task-types/actions"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs } from "../helpers/auth-mock"
import { createVolunteer, getFacilityTaskType } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

// FacilityTaskType is a lookup table (tests/vitest/helpers/db.ts), never truncated between
// tests — every test here that renames a seeded row restores it afterward, same discipline
// settings.test.ts already follows for ShiftTemplate/FarmSettings.
afterEach(async () => {
  const troughClean = await prisma.facilityTaskType.findUnique({ where: { category: "TROUGH_CLEAN" } })
  if (troughClean) await prisma.facilityTaskType.update({ where: { id: troughClean.id }, data: { name: "Trough Clean", active: true } })
})

describe("updateFacilityTaskType", () => {
  it("is Admin-only — a Shift Lead is rejected and nothing changes", async () => {
    const taskType = await getFacilityTaskType("TROUGH_CLEAN")
    await createVolunteer({ clerkId: "clerk_lead_uftt", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_lead_uftt")

    await expect(updateFacilityTaskType(taskType.id, formData({ name: "Renamed", active: "on" }))).rejects.toThrow("Not authorized")
    const unchanged = await prisma.facilityTaskType.findUniqueOrThrow({ where: { id: taskType.id } })
    expect(unchanged.name).toBe(taskType.name)
  })

  it("lets an Admin rename a facility task type and toggle it inactive, without touching its category", async () => {
    const taskType = await getFacilityTaskType("TROUGH_CLEAN")
    await createVolunteer({ clerkId: "clerk_admin_uftt", role: "ADMIN" })
    mockSignedInAs("clerk_admin_uftt")

    const url = await captureRedirect(() => updateFacilityTaskType(taskType.id, formData({ name: "Water Trough Clean" })))

    expect(url).toBe("/admin/facility-task-types")
    const updated = await prisma.facilityTaskType.findUniqueOrThrow({ where: { id: taskType.id } })
    expect(updated.name).toBe("Water Trough Clean")
    expect(updated.active).toBe(false)
    expect(updated.category).toBe("TROUGH_CLEAN")
  })
})
