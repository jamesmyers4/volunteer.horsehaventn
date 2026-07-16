"use server"

import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma, withChangeLog } from "@/lib/prisma"

export async function assignPasture(horseId: string, formData: FormData) {
  const volunteer = await requireRole(["ADMIN"])

  const fieldId = String(formData.get("fieldId"))
  const today = new Date(new Date().toISOString().slice(0, 10))

  const current = await prisma.pastureAssignment.findFirst({ where: { horseId, endDate: null } })
  if (current) {
    await withChangeLog(prisma, volunteer.id, "Pasture assignment closed").pastureAssignment.update({
      where: { id: current.id },
      data: { endDate: today }
    })
  }

  await withChangeLog(prisma, volunteer.id, "Pasture assignment opened").pastureAssignment.create({
    data: { horseId, fieldId, startDate: today }
  })

  redirect(`/horses/${horseId}`)
}
