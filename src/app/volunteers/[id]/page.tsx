import { notFound } from "next/navigation"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { computeTiers } from "@/lib/tier"
import { releaseBlue } from "../tier-actions"
import { logTrainingCompletion } from "../training-actions"
import { assignTag, removeTag } from "../tag-actions"

export default async function VolunteerDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const currentVolunteer = await requireVolunteer()
  const { id } = await params

  const [volunteer, thresholds, credentialTypes, allTags, tagAssignments] = await Promise.all([
    prisma.volunteer.findUnique({ where: { id } }),
    prisma.tierThreshold.findMany(),
    prisma.credentialType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.volunteerTag.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.volunteerTagAssignment.findMany({ where: { volunteerId: id, removedAt: null }, include: { tag: true } })
  ])

  if (!volunteer) notFound()

  const completions = await prisma.credentialRecord.findMany({
    where: { volunteerId: id },
    orderBy: [{ credentialTypeId: "asc" }, { completedDate: "desc" }],
    distinct: ["credentialTypeId"]
  })
  const completionByType = new Map(completions.map((c) => [c.credentialTypeId, c]))

  const { tenureDays, computedEligibleTier, actualTier, blueTenureMet } = computeTiers(volunteer, thresholds)

  const isOwnPage = currentVolunteer.id === volunteer.id
  const canReleaseBlue = (currentVolunteer.role === "ADMIN" || currentVolunteer.role === "SHIFT_LEAD") && !volunteer.blueReleasedAt
  const canManageTags = currentVolunteer.role === "ADMIN" || currentVolunteer.role === "SHIFT_LEAD"
  const assignedTagIds = new Set(tagAssignments.map((a) => a.tagId))
  const availableTags = allTags.filter((tag) => !assignedTagIds.has(tag.id))

  const today = new Date()

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">{volunteer.name}</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Tier progression</h2>
        <dl className="grid max-w-md grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <dt className="text-gray-500">First shift</dt>
          <dd>{volunteer.firstShiftDate ? volunteer.firstShiftDate.toDateString() : "—"}</dd>
          <dt className="text-gray-500">Tenure</dt>
          <dd>{volunteer.firstShiftDate ? `${tenureDays} days` : "0 days (no recorded shifts yet)"}</dd>
          <dt className="text-gray-500">Computed eligible tier</dt>
          <dd>{computedEligibleTier}</dd>
          <dt className="text-gray-500">Actual tier</dt>
          <dd className="font-semibold">{actualTier}</dd>
          <dt className="text-gray-500">Blue released</dt>
          <dd>{volunteer.blueReleasedAt ? volunteer.blueReleasedAt.toDateString() : "Not yet"}</dd>
        </dl>
        {canReleaseBlue && (
          <form action={releaseBlue.bind(null, volunteer.id)}>
            <button
              type="submit"
              disabled={!blueTenureMet}
              className="w-fit rounded bg-black px-4 py-2 text-xs text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Release for Blue
            </button>
            {!blueTenureMet && <p className="mt-1 text-xs text-gray-500">Blocked — tenure threshold not met yet.</p>}
          </form>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Credentials &amp; training</h2>
        <table className="w-full max-w-2xl text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Requirement</th>
              <th className="py-2">Status</th>
              <th className="py-2">Completed</th>
              <th className="py-2">Expires</th>
              {isOwnPage && <th className="py-2">Acknowledge</th>}
            </tr>
          </thead>
          <tbody>
            {credentialTypes.map((credentialType) => {
              const completion = completionByType.get(credentialType.id)
              const expired = completion?.expiresAt ? completion.expiresAt < today : false
              return (
                <tr key={credentialType.id} className="border-b align-top">
                  <td className="py-2">
                    {credentialType.name}
                    {credentialType.isRequired && <span className="text-gray-500"> (required)</span>}
                  </td>
                  <td className="py-2">{!completion ? "Missing" : expired ? "Expired" : "Current"}</td>
                  <td className="py-2">{completion ? completion.completedDate.toDateString() : "—"}</td>
                  <td className="py-2">{completion?.expiresAt ? completion.expiresAt.toDateString() : "—"}</td>
                  {isOwnPage && (
                    <td className="py-2">
                      <form action={logTrainingCompletion.bind(null, credentialType.id)}>
                        <button type="submit" className="rounded border px-2 py-1 text-xs">
                          I read this
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
        {credentialTypes.length === 0 && <p className="text-sm text-gray-500">No credential types configured.</p>}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Tags</h2>
        {tagAssignments.length === 0 ? (
          <p className="text-sm text-gray-500">No tags assigned.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {tagAssignments.map((assignment) => (
              <li key={assignment.id} className="flex items-center gap-2">
                <span className="font-medium">{assignment.tag.name}</span>
                {canManageTags && (
                  <form action={removeTag.bind(null, assignment.id)}>
                    <button type="submit" className="rounded border px-2 py-0.5 text-xs">
                      Remove
                    </button>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
        {canManageTags && availableTags.length > 0 && (
          <form action={assignTag.bind(null, volunteer.id)} className="flex w-fit items-center gap-2 text-sm">
            <select name="tagId" required className="rounded border px-2 py-1 text-xs">
              {availableTags.map((tag) => (
                <option key={tag.id} value={tag.id}>
                  {tag.name}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded border px-2 py-1 text-xs">
              Assign tag
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
