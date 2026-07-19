import { prisma } from "@/lib/prisma"

/**
 * Volunteers missing, or past-expiry on, a required (isRequired + active) CredentialType.
 * V2.md Session 2 asks for this as a "missing/expired required training" query — reuses the
 * existing CredentialType/CredentialRecord mechanism (CONTEXT.md §7) rather than a parallel
 * TrainingRequirement table (see prisma/schema.prisma's comment on CredentialType).
 */
export async function getMissingOrExpiredRequiredTraining(today: Date = new Date()) {
  const [requirements, volunteers] = await Promise.all([
    prisma.credentialType.findMany({ where: { isRequired: true, active: true } }),
    prisma.volunteer.findMany({ where: { status: "ACTIVE" } })
  ])
  if (requirements.length === 0 || volunteers.length === 0) return []

  const records = await prisma.credentialRecord.findMany({
    where: { volunteerId: { in: volunteers.map((v) => v.id) }, credentialTypeId: { in: requirements.map((r) => r.id) } },
    orderBy: [{ volunteerId: "asc" }, { credentialTypeId: "asc" }, { completedDate: "desc" }],
    distinct: ["volunteerId", "credentialTypeId"]
  })
  const latestByVolunteerAndType = new Map(records.map((r) => [`${r.volunteerId}:${r.credentialTypeId}`, r]))

  const gaps: { volunteer: (typeof volunteers)[number]; requirement: (typeof requirements)[number]; status: "missing" | "expired" }[] = []
  for (const volunteer of volunteers) {
    for (const requirement of requirements) {
      const record = latestByVolunteerAndType.get(`${volunteer.id}:${requirement.id}`)
      if (!record) {
        gaps.push({ volunteer, requirement, status: "missing" })
      } else if (record.expiresAt && record.expiresAt < today) {
        gaps.push({ volunteer, requirement, status: "expired" })
      }
    }
  }
  return gaps
}
