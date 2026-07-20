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
  // V3.md Session 2: BARN_STALL-specific, same per-type field pattern as barnNumber/stallNumber.
  const requiresStripCleanRaw = formData.get("requiresStripClean")

  if (type === "FIELD") {
    if (barnNumberRaw || stallNumberRaw) throw new Error("A FIELD location cannot have a barn/stall number")
    if (requiresStripCleanRaw) throw new Error("A FIELD location cannot require strip cleaning")
  } else {
    if (fieldCodeRaw) throw new Error(`A ${type} location cannot have a field code`)
    if (turnoutOrderRaw || bringInOrderRaw) throw new Error(`A ${type} location cannot have a turnout/bring-in order`)
    if (type !== "BARN_STALL" && (barnNumberRaw || stallNumberRaw)) {
      throw new Error(`A ${type} location cannot have a barn/stall number`)
    }
    if (type !== "BARN_STALL" && requiresStripCleanRaw) throw new Error(`A ${type} location cannot require strip cleaning`)
  }

  await prisma.location.create({
    data: {
      type,
      name,
      fieldCode: type === "FIELD" && fieldCodeRaw ? String(fieldCodeRaw) : undefined,
      barnNumber: type === "BARN_STALL" && barnNumberRaw ? Number(barnNumberRaw) : undefined,
      stallNumber: type === "BARN_STALL" && stallNumberRaw ? Number(stallNumberRaw) : undefined,
      turnoutOrder: type === "FIELD" && turnoutOrderRaw ? Number(turnoutOrderRaw) : undefined,
      bringInOrder: type === "FIELD" && bringInOrderRaw ? Number(bringInOrderRaw) : undefined,
      requiresStripClean: type === "BARN_STALL" && requiresStripCleanRaw === "on"
    }
  })

  // V2.md Session 7: the Admin Console's own Locations screen reuses this action rather than
  // duplicating create logic, and needs to land back on /admin/locations instead of the plain
  // /locations list — same optional redirectTo pattern Session 6 already established for
  // createFeedingOverride/createLocationAssignment.
  const redirectTo = formData.get("redirectTo")
  redirect(redirectTo ? String(redirectTo) : "/locations")
}

// V2.md Session 7: full CRUD for Location was explicitly deferred to the Admin Console (see
// HANDOFF.md's Session 1 note) — only create existed until now. Type itself is not editable
// (changing FIELD to BARN_STALL etc. on an existing row with real assignment history would be
// a stranger operation than this screen needs to support); name/isActive/type-specific fields
// are. Same per-type validation as createLocation, kept in sync rather than factored out since
// the two field sets differ slightly (type is fixed here, not chosen).
export async function updateLocation(locationId: string, formData: FormData) {
  await requireRole(["ADMIN"])

  const location = await prisma.location.findUniqueOrThrow({ where: { id: locationId } })
  const type = location.type as LocationType

  const name = String(formData.get("name"))
  const isActive = formData.get("isActive") === "on"
  const fieldCodeRaw = formData.get("fieldCode")
  const barnNumberRaw = formData.get("barnNumber")
  const stallNumberRaw = formData.get("stallNumber")
  const turnoutOrderRaw = formData.get("turnoutOrder")
  const bringInOrderRaw = formData.get("bringInOrder")
  const requiresStripCleanRaw = formData.get("requiresStripClean")

  if (type === "FIELD") {
    if (barnNumberRaw || stallNumberRaw) throw new Error("A FIELD location cannot have a barn/stall number")
    if (requiresStripCleanRaw) throw new Error("A FIELD location cannot require strip cleaning")
  } else {
    if (fieldCodeRaw) throw new Error(`A ${type} location cannot have a field code`)
    if (turnoutOrderRaw || bringInOrderRaw) throw new Error(`A ${type} location cannot have a turnout/bring-in order`)
    if (type !== "BARN_STALL" && (barnNumberRaw || stallNumberRaw)) {
      throw new Error(`A ${type} location cannot have a barn/stall number`)
    }
    if (type !== "BARN_STALL" && requiresStripCleanRaw) throw new Error(`A ${type} location cannot require strip cleaning`)
  }

  await prisma.location.update({
    where: { id: locationId },
    data: {
      name,
      isActive,
      fieldCode: type === "FIELD" && fieldCodeRaw ? String(fieldCodeRaw) : null,
      barnNumber: type === "BARN_STALL" && barnNumberRaw ? Number(barnNumberRaw) : null,
      stallNumber: type === "BARN_STALL" && stallNumberRaw ? Number(stallNumberRaw) : null,
      turnoutOrder: type === "FIELD" && turnoutOrderRaw ? Number(turnoutOrderRaw) : null,
      bringInOrder: type === "FIELD" && bringInOrderRaw ? Number(bringInOrderRaw) : null,
      requiresStripClean: type === "BARN_STALL" && requiresStripCleanRaw === "on"
    }
  })

  redirect("/admin/locations")
}
