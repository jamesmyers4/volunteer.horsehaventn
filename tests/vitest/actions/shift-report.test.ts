import { randomUUID } from "node:crypto"
import { describe, it, expect } from "vitest"
import {
  createChecklistTemplate,
  updateChecklistTemplate,
  createChecklistTemplateItem,
  updateChecklistTemplateItem
} from "@/app/checklists/actions"
import { submitShiftReport } from "@/app/checkin/shift-report/actions"
import { canSubmitShiftReport } from "@/lib/shiftReport"
import { prisma } from "@/lib/prisma"
import { mockSignedInAs } from "../helpers/auth-mock"
import { createVolunteer, createChecklistTemplateWithItem, getChecklistTemplate } from "../helpers/factories"
import { formData } from "../helpers/form"
import { captureRedirect } from "../helpers/signals"

const REFERENCE_DATE_STRING = "2026-07-20"
const REFERENCE_DATE = new Date(REFERENCE_DATE_STRING)

describe("canSubmitShiftReport", () => {
  it("allows global ADMIN regardless of assignedLeadId", () => {
    expect(canSubmitShiftReport({ id: "x", role: "ADMIN" }, null)).toBe(true)
    expect(canSubmitShiftReport({ id: "x", role: "ADMIN" }, { assignedLeadId: "someone-else" })).toBe(true)
  })

  it("allows the shift's own assignedLeadId, regardless of global role", () => {
    expect(canSubmitShiftReport({ id: "vol-1", role: "VOLUNTEER" }, { assignedLeadId: "vol-1" })).toBe(true)
  })

  it("rejects a global SHIFT_LEAD who isn't this occurrence's assignedLeadId — narrower than roster management", () => {
    expect(canSubmitShiftReport({ id: "vol-1", role: "SHIFT_LEAD" }, { assignedLeadId: "someone-else" })).toBe(false)
    expect(canSubmitShiftReport({ id: "vol-1", role: "SHIFT_LEAD" }, null)).toBe(false)
  })

  it("rejects a plain Volunteer who isn't the assigned lead", () => {
    expect(canSubmitShiftReport({ id: "vol-1", role: "VOLUNTEER" }, { assignedLeadId: "vol-2" })).toBe(false)
    expect(canSubmitShiftReport({ id: "vol-1", role: "VOLUNTEER" }, null)).toBe(false)
  })
})

describe("ChecklistTemplate/ChecklistTemplateItem CRUD", () => {
  it("is Admin-only — a plain Volunteer is rejected and nothing is written", async () => {
    await createVolunteer({ clerkId: "clerk_ct_vol", role: "VOLUNTEER" })
    mockSignedInAs("clerk_ct_vol")
    const rejectedName = `Rejected Template ${randomUUID().slice(0, 8)}`

    await expect(createChecklistTemplate(formData({ name: rejectedName }))).rejects.toThrow("Not authorized")
    expect(await prisma.checklistTemplate.findFirst({ where: { name: rejectedName } })).toBeNull()
  })

  it("lets an Admin create a template and add/edit an item on it", async () => {
    await createVolunteer({ clerkId: "clerk_ct_admin", role: "ADMIN" })
    mockSignedInAs("clerk_ct_admin")
    const templateName = `Admin Created Template ${randomUUID().slice(0, 8)}`

    const redirectUrl = await captureRedirect(() => createChecklistTemplate(formData({ name: templateName })))
    expect(redirectUrl).toBe("/checklists")
    const template = await prisma.checklistTemplate.findFirstOrThrow({ where: { name: templateName } })
    expect(template.isActive).toBe(true)

    await captureRedirect(() =>
      createChecklistTemplateItem(template.id, formData({ order: "0", prompt: "Weather notes", responseType: "TEXT" }))
    )
    const item = await prisma.checklistTemplateItem.findFirstOrThrow({ where: { templateId: template.id } })
    expect(item.prompt).toBe("Weather notes")
    expect(item.responseType).toBe("TEXT")

    await captureRedirect(() =>
      updateChecklistTemplateItem(item.id, formData({ order: "1", prompt: "Weather notes (revised)", responseType: "NUMBER" }))
    )
    const updatedItem = await prisma.checklistTemplateItem.findUniqueOrThrow({ where: { id: item.id } })
    expect(updatedItem.prompt).toBe("Weather notes (revised)")
    expect(updatedItem.responseType).toBe("NUMBER")
    expect(updatedItem.order).toBe(1)

    await captureRedirect(() => updateChecklistTemplate(template.id, formData({ name: templateName, isActive: "" })))
    const deactivated = await prisma.checklistTemplate.findUniqueOrThrow({ where: { id: template.id } })
    expect(deactivated.isActive).toBe(false)
  })

  it("the seeded default template has exactly one placeholder TEXT item", async () => {
    const template = await getChecklistTemplate()
    const items = await prisma.checklistTemplateItem.findMany({ where: { templateId: template.id } })
    expect(items).toHaveLength(1)
    expect(items[0].prompt).toBe("General shift notes")
    expect(items[0].responseType).toBe("TEXT")
  })
})

describe("submitShiftReport", () => {
  // V4.md Session 1 defense-in-depth: submitShiftReport now calls requireNonKioskVolunteer()
  // before canSubmitShiftReport's own assignedLeadId/ADMIN check even runs, so a KIOSK account
  // is rejected even in the (admin-misconfiguration) case where it was named assignedLeadId.
  it("rejects a KIOSK-role account even when named as the occurrence's assignedLeadId", async () => {
    const kiosk = await createVolunteer({ clerkId: "clerk_sr_kiosk", role: "KIOSK" })
    mockSignedInAs("clerk_sr_kiosk")
    await prisma.shift.create({ data: { date: REFERENCE_DATE, type: "AM", assignedLeadId: kiosk.id } })
    const { template } = await createChecklistTemplateWithItem()

    await expect(submitShiftReport(REFERENCE_DATE_STRING, "AM", formData({ templateId: template.id }))).rejects.toThrow("Not authorized")
    expect(await prisma.shiftReport.count()).toBe(0)
  })

  it("rejects a Volunteer who is neither the assigned lead nor global ADMIN", async () => {
    await createVolunteer({ clerkId: "clerk_sr_vol", role: "VOLUNTEER" })
    mockSignedInAs("clerk_sr_vol")
    const { template } = await createChecklistTemplateWithItem()

    await expect(
      submitShiftReport(REFERENCE_DATE_STRING, "AM", formData({ templateId: template.id }))
    ).rejects.toThrow("Not authorized")
    expect(await prisma.shiftReport.count()).toBe(0)
  })

  it("rejects a global SHIFT_LEAD who isn't the assigned lead for this occurrence", async () => {
    await createVolunteer({ clerkId: "clerk_sr_lead_global", role: "SHIFT_LEAD" })
    mockSignedInAs("clerk_sr_lead_global")
    const { template } = await createChecklistTemplateWithItem()

    await expect(
      submitShiftReport(REFERENCE_DATE_STRING, "AM", formData({ templateId: template.id }))
    ).rejects.toThrow("Not authorized")
  })

  it("lets the occurrence's assignedLeadId submit, storing responses keyed to their template items", async () => {
    const namedLead = await createVolunteer({ clerkId: "clerk_sr_named_lead", role: "VOLUNTEER" })
    mockSignedInAs("clerk_sr_named_lead")
    await prisma.shift.create({ data: { date: REFERENCE_DATE, type: "AM", assignedLeadId: namedLead.id } })
    const { template, item } = await createChecklistTemplateWithItem({ prompt: "Anything unusual?", responseType: "TEXT" })

    const fd = formData({ templateId: template.id })
    fd.set(`item_${item.id}`, "All quiet, no issues.")
    const redirectUrl = await captureRedirect(() => submitShiftReport(REFERENCE_DATE_STRING, "AM", fd))
    expect(redirectUrl).toBe(`/checkin/shift-report?date=${REFERENCE_DATE_STRING}&shiftType=AM&success=1`)

    const report = await prisma.shiftReport.findFirstOrThrow({ where: { templateId: template.id }, include: { responses: true } })
    expect(report.submittedById).toBe(namedLead.id)
    expect(report.responses).toHaveLength(1)
    expect(report.responses[0].templateItemId).toBe(item.id)
    expect(report.responses[0].value).toBe("All quiet, no issues.")
  })

  it("lets a global ADMIN submit for any shift, and correctly stores a BOOLEAN response as text", async () => {
    await createVolunteer({ clerkId: "clerk_sr_admin", role: "ADMIN" })
    mockSignedInAs("clerk_sr_admin")
    const { template, item } = await createChecklistTemplateWithItem({ prompt: "Gates locked?", responseType: "BOOLEAN" })

    const fd = formData({ templateId: template.id })
    fd.set(`item_${item.id}`, "on")
    await captureRedirect(() => submitShiftReport(REFERENCE_DATE_STRING, "PM", fd))

    const response = await prisma.shiftReportResponse.findFirstOrThrow({ where: { templateItemId: item.id } })
    expect(response.value).toBe("true")
  })

  it("an unchecked BOOLEAN item (absent from FormData) is stored as false, not left out", async () => {
    await createVolunteer({ clerkId: "clerk_sr_admin_bool", role: "ADMIN" })
    mockSignedInAs("clerk_sr_admin_bool")
    const { template, item } = await createChecklistTemplateWithItem({ prompt: "Gates locked?", responseType: "BOOLEAN" })

    await captureRedirect(() => submitShiftReport(REFERENCE_DATE_STRING, "PM", formData({ templateId: template.id })))

    const response = await prisma.shiftReportResponse.findFirstOrThrow({ where: { templateItemId: item.id } })
    expect(response.value).toBe("false")
  })

  it("enforces one ShiftReport per Shift — a second submission attempt is rejected", async () => {
    await createVolunteer({ clerkId: "clerk_sr_admin2", role: "ADMIN" })
    mockSignedInAs("clerk_sr_admin2")
    const { template } = await createChecklistTemplateWithItem()

    await captureRedirect(() => submitShiftReport(REFERENCE_DATE_STRING, "AM", formData({ templateId: template.id })))

    await expect(
      submitShiftReport(REFERENCE_DATE_STRING, "AM", formData({ templateId: template.id }))
    ).rejects.toThrow("A shift report has already been submitted for this shift")
    expect(await prisma.shiftReport.count({ where: { shift: { date: REFERENCE_DATE, type: "AM" } } })).toBe(1)
  })
})
