"use server"

import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export type ChecklistResponseTypeValue = "BOOLEAN" | "TEXT" | "NUMBER"

// V3.md Session 5: admin-editable lookup, same category as WorkType/FeedType/CareType — not
// ChangeLog-tracked. Basic list page for now (this session), same "basic page now, polished
// Admin Console screen later" split as IntakeGroup/RecurringTaskTemplate — the full Admin
// Console screen is deferred to V3.md Session 7.
export async function createChecklistTemplate(formData: FormData) {
  await requireRole(["ADMIN"])

  const name = String(formData.get("name"))
  await prisma.checklistTemplate.create({ data: { name } })

  redirect("/checklists")
}

// No hard deletes — deactivate via isActive, same as IntakeGroup/Location's own pattern,
// rather than removing the row (or its items, which have no delete path of their own either).
export async function updateChecklistTemplate(templateId: string, formData: FormData) {
  await requireRole(["ADMIN"])

  const name = String(formData.get("name"))
  const isActive = formData.get("isActive") === "on"
  await prisma.checklistTemplate.update({ where: { id: templateId }, data: { name, isActive } })

  redirect("/checklists")
}

export async function createChecklistTemplateItem(templateId: string, formData: FormData) {
  await requireRole(["ADMIN"])

  const order = Number(formData.get("order"))
  const prompt = String(formData.get("prompt"))
  const responseType = String(formData.get("responseType")) as ChecklistResponseTypeValue
  await prisma.checklistTemplateItem.create({ data: { templateId, order, prompt, responseType } })

  redirect("/checklists")
}

// order/prompt/responseType are all correctable in place — V3.md's field list gives
// ChecklistTemplateItem no isActive/deactivation of its own, only ChecklistTemplate does.
export async function updateChecklistTemplateItem(itemId: string, formData: FormData) {
  await requireRole(["ADMIN"])

  const order = Number(formData.get("order"))
  const prompt = String(formData.get("prompt"))
  const responseType = String(formData.get("responseType")) as ChecklistResponseTypeValue
  await prisma.checklistTemplateItem.update({ where: { id: itemId }, data: { order, prompt, responseType } })

  redirect("/checklists")
}
