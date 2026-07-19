"use server"

import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

type LocationType = "FIELD" | "BARN_STALL" | "SICK_BAY" | "ARENA" | "OTHER"

// Location is an admin-managed lookup table, same category as FeedType/CareType — not
// ChangeLog-tracked (CLAUDE.md only tracks data entities, not lookup/config rows).
// Per-type field validity (V2.md Session 1) is enforced here rather than a DB constraint,
// matching this project's general preference for app-side checks on admin-entered data.
export async function createLocation(formData: FormData) {
  await requireRole(["ADMIN"])

  const type = String(formData.get("type")) as LocationType
  const name = String(formData.get("name"))
  const fieldCodeRaw = formData.get("fieldCode")
  const barnNumberRaw = formData.get("barnNumber")
  const stallNumberRaw = formData.get("stallNumber")
  const turnoutOrderRaw = formData.get("turnoutOrder")
  const bringInOrderRaw = formData.get("bringInOrder")

  if (type === "FIELD") {
    if (barnNumberRaw || stallNumberRaw) throw new Error("A FIELD location cannot have a barn/stall number")
  } else {
    if (fieldCodeRaw) throw new Error(`A ${type} location cannot have a field code`)
    if (turnoutOrderRaw || bringInOrderRaw) throw new Error(`A ${type} location cannot have a turnout/bring-in order`)
    if (type !== "BARN_STALL" && (barnNumberRaw || stallNumberRaw)) {
      throw new Error(`A ${type} location cannot have a barn/stall number`)
    }
  }

  await prisma.location.create({
    data: {
      type,
      name,
      fieldCode: type === "FIELD" && fieldCodeRaw ? String(fieldCodeRaw) : undefined,
      barnNumber: type === "BARN_STALL" && barnNumberRaw ? Number(barnNumberRaw) : undefined,
      stallNumber: type === "BARN_STALL" && stallNumberRaw ? Number(stallNumberRaw) : undefined,
      turnoutOrder: type === "FIELD" && turnoutOrderRaw ? Number(turnoutOrderRaw) : undefined,
      bringInOrder: type === "FIELD" && bringInOrderRaw ? Number(bringInOrderRaw) : undefined
    }
  })

  redirect("/locations")
}
