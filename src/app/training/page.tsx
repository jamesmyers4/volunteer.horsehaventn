import Link from "next/link"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getMissingOrExpiredRequiredTraining } from "@/lib/training"
import { createCredentialType, updateCredentialType } from "@/app/volunteers/training-actions"

export default async function TrainingPage() {
  const volunteer = await requireVolunteer()
  const canManage = volunteer.role === "ADMIN"
  const canSeeReport = volunteer.role === "ADMIN" || volunteer.role === "SHIFT_LEAD"

  const credentialTypes = await prisma.credentialType.findMany({ orderBy: { name: "asc" } })
  const gaps = canSeeReport ? await getMissingOrExpiredRequiredTraining() : []

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">Credentials &amp; Compliance Training</h1>
      <p className="text-sm text-gray-500">
        Covers both vaccination records and annual compliance training under one mechanism (CONTEXT.md §7). Volunteers acknowledge required items
        from their own <Link href="/volunteers" className="underline">volunteer page</Link>.
      </p>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Requirement types</h2>
        <table className="w-full max-w-3xl text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Name</th>
              <th className="py-2">Required</th>
              <th className="py-2">Renewal (days)</th>
              <th className="py-2">Active</th>
              {canManage && <th className="py-2">Edit</th>}
            </tr>
          </thead>
          <tbody>
            {credentialTypes.map((credentialType) => (
              <tr key={credentialType.id} className="border-b align-top">
                <td className="py-2">{credentialType.name}</td>
                <td className="py-2">{credentialType.isRequired ? "Yes" : "No"}</td>
                <td className="py-2">{credentialType.renewalPeriodDays ?? "Never expires"}</td>
                <td className="py-2">{credentialType.active ? "Yes" : "No"}</td>
                {canManage && (
                  <td className="py-2">
                    <form action={updateCredentialType.bind(null, credentialType.id)} className="flex flex-col gap-1">
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" name="isRequired" defaultChecked={credentialType.isRequired} />
                        required
                      </label>
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" name="active" defaultChecked={credentialType.active} />
                        active
                      </label>
                      <input
                        type="number"
                        name="renewalPeriodDays"
                        defaultValue={credentialType.renewalPeriodDays ?? ""}
                        placeholder="renewal days (blank = never)"
                        className="w-40 rounded border px-2 py-1 text-xs"
                      />
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
        {canManage && (
          <form action={createCredentialType} className="flex w-full max-w-xs flex-col gap-2 text-sm">
            <h3 className="text-xs font-semibold text-gray-500">Add requirement type</h3>
            <input type="text" name="name" placeholder="name" required className="rounded border px-2 py-1" />
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" name="isRequired" />
              required
            </label>
            <input type="number" name="renewalPeriodDays" placeholder="renewal days (blank = never)" className="rounded border px-2 py-1" />
            <input type="text" name="fileUrl" placeholder="file URL (optional)" className="rounded border px-2 py-1" />
            <button type="submit" className="w-fit rounded bg-black px-4 py-2 text-xs text-white">
              Add
            </button>
          </form>
        )}
      </section>

      {canSeeReport && (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Missing or expired required training</h2>
          {gaps.length === 0 && <p className="text-sm text-gray-500">Nothing outstanding.</p>}
          <ul className="flex flex-col gap-1 text-sm">
            {gaps.map((gap, index) => (
              <li key={index}>
                <Link href={`/volunteers/${gap.volunteer.id}`} className="underline">
                  {gap.volunteer.name}
                </Link>{" "}
                — {gap.requirement.name} ({gap.status})
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
