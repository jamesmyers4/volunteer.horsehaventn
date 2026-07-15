"use server"

import { redirect } from "next/navigation"
import { requireVolunteer } from "@/lib/auth"
import { prisma, withChangeLog } from "@/lib/prisma"

export async function submitCheckIn(formData: FormData) {
  const volunteer = await requireVolunteer()

  const date = String(formData.get("date"))
  const shiftType = String(formData.get("shiftType")) as "AM" | "PM"
  const workTypeId = String(formData.get("workTypeId"))
  const checkInTime = String(formData.get("checkInTime"))
  const checkOutTime = String(formData.get("checkOutTime"))
  const notes = formData.get("notes") ? String(formData.get("notes")) : undefined

  const checkInAt = new Date(`${date}T${checkInTime}:00`)
  const checkOutAt = new Date(`${date}T${checkOutTime}:00`)

  const shift = await prisma.shift.upsert({
    where: { date_type: { date: new Date(date), type: shiftType } },
    update: {},
    create: { date: new Date(date), type: shiftType }
  })

  await withChangeLog(prisma, volunteer.id, "Self-service check-in").checkIn.create({
    data: {
      volunteerId: volunteer.id,
      shiftId: shift.id,
      workTypeId,
      checkInAt,
      checkOutAt,
      checkInMethod: "WEB_FORM",
      checkOutMethod: "WEB_FORM",
      notes
    }
  })

  redirect("/checkin?success=1")
}
