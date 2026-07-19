import Link from "next/link"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getTagEligibilityCandidates } from "@/lib/tags"
import { createVolunteerTag, updateVolunteerTag } from "@/app/volunteers/tag-actions"

export default async function TagsPage() {
  const volunteer = await requireVolunteer()
  const canManage = volunteer.role === "ADMIN"
  const canSeeReports = volunteer.role === "ADMIN" || volunteer.role === "SHIFT_LEAD"

  const tags = await prisma.volunteerTag.findMany({ orderBy: { name: "asc" } })
  const reportTags = tags.filter((tag) => tag.active && tag.minDaysSinceBlueRelease !== null)
  const candidatesByTag = new Map(
    canSeeReports ? await Promise.all(reportTags.map(async (tag) => [tag.id, await getTagEligibilityCandidates(tag.id)] as const)) : []
  )

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">Volunteer Tags</h1>
      <p className="text-sm text-gray-500">
        Generic tagging — Go Team is the first real tag. Tags are always assigned/removed manually from a volunteer&apos;s own{" "}
        <Link href="/volunteers" className="underline">
          page
        </Link>
        , never automatically.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Tag types</h2>
        <table className="w-full max-w-3xl text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Name</th>
              <th className="py-2">Description</th>
              <th className="py-2">Eligibility report: days since Blue release</th>
              <th className="py-2">Active</th>
              {canManage && <th className="py-2">Edit</th>}
            </tr>
          </thead>
          <tbody>
            {tags.map((tag) => (
              <tr key={tag.id} className="border-b align-top">
                <td className="py-2 font-medium">{tag.name}</td>
                <td className="py-2">{tag.description ?? "—"}</td>
                <td className="py-2">{tag.minDaysSinceBlueRelease ?? "Not configured"}</td>
                <td className="py-2">{tag.active ? "Yes" : "No"}</td>
                {canManage && (
                  <td className="py-2">
                    <form action={updateVolunteerTag.bind(null, tag.id)} className="flex flex-col gap-1">
                      <input
                        type="text"
                        name="description"
                        defaultValue={tag.description ?? ""}
                        placeholder="description"
                        className="rounded border px-2 py-1 text-xs"
                      />
                      <input
                        type="number"
                        name="minDaysSinceBlueRelease"
                        defaultValue={tag.minDaysSinceBlueRelease ?? ""}
                        placeholder="days since Blue release (blank = no report)"
                        className="w-56 rounded border px-2 py-1 text-xs"
                      />
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" name="active" defaultChecked={tag.active} />
                        active
                      </label>
                      <button type="submit" className="w-fit rounded border px-2 py-1 text-xs">
                        Save
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {tags.length === 0 && <p className="text-sm text-gray-500">No tags configured.</p>}
        {canManage && (
          <form action={createVolunteerTag} className="flex w-full max-w-xs flex-col gap-2 text-sm">
            <h3 className="text-xs font-semibold text-gray-500">Add tag</h3>
            <input type="text" name="name" placeholder="name" required className="rounded border px-2 py-1" />
            <input type="text" name="description" placeholder="description (optional)" className="rounded border px-2 py-1" />
            <input
              type="number"
              name="minDaysSinceBlueRelease"
              placeholder="days since Blue release (optional)"
              className="rounded border px-2 py-1"
            />
            <button type="submit" className="w-fit rounded bg-black px-4 py-2 text-xs text-white">
              Add tag
            </button>
          </form>
        )}
      </section>

      {canSeeReports && reportTags.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Eligibility candidates</h2>
          <p className="text-xs text-gray-500">For a human to review — not an automatic tag assignment.</p>
          {reportTags.map((tag) => {
            const candidates = candidatesByTag.get(tag.id) ?? []
            return (
              <div key={tag.id} className="flex flex-col gap-1">
                <h3 className="text-xs font-semibold">{tag.name}</h3>
                {candidates.length === 0 ? (
                  <p className="text-sm text-gray-500">No candidates right now.</p>
                ) : (
                  <ul className="flex flex-col gap-1 text-sm">
                    {candidates.map((candidate) => (
                      <li key={candidate.id}>
                        <Link href={`/volunteers/${candidate.id}`} className="underline">
                          {candidate.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )
          })}
        </section>
      )}
    </main>
  )
}
