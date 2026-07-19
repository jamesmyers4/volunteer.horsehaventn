"use server"

import { redirect } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma, withChangeLog } from "@/lib/prisma"
import { computeTiers } from "@/lib/tier"

// V2.md Session 2: manual human gate for Blue, independent of tenure. Confirmed with James
// (genuinely ambiguous per V2.md's own note): releasing a volunteer who hasn't hit BLUE's
// tenure threshold yet is blocked outright, not allowed-with-a-flag — tenure stays a hard
// floor rather than something an admin can route around by accident.
export async function releaseBlue(volunteerId: string) {
  const actor = await requireRole(["ADMIN", "SHIFT_LEAD"])

  const [target, thresholds] = await Promise.all([
    prisma.volunteer.findUniqueOrThrow({ where: { id: volunteerId } }),
    prisma.tierThreshold.findMany()
  ])

  if (target.blueReleasedAt) throw new Error("Volunteer is already Blue-released")

  const { blueTenureMet } = computeTiers(target, thresholds)
  if (!blueTenureMet) throw new Error("Volunteer has not met Blue's tenure threshold yet — release is blocked until then")

  await withChangeLog(prisma, actor.id, "Manual Blue release").volunteer.update({
    where: { id: volunteerId },
    data: { blueReleasedAt: new Date(), blueReleasedById: actor.id }
  })

  redirect(`/volunteers/${volunteerId}`)
}
