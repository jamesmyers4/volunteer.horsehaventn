import Link from "next/link"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createIntakeGroup } from "./actions"

export default async function IntakeGroupsPage() {
  const volunteer = await requireVolunteer()
  const canManage = volunteer.role === "ADMIN"

  const groups = await prisma.intakeGroup.findMany({
    include: { _count: { select: { animals: true } } },
    orderBy: { intakeDate: "desc" }
  })

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">Intake Groups</h1>
      <p className="text-sm text-gray-500">
        Animals that arrived together as a cohort — often thematically named (an Irish-themed group, a luxury-brand group). Assign an animal to a
        group from that animal&apos;s own detail page.
      </p>
      <table className="w-full max-w-2xl text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Label</th>
            <th className="py-2">Intake date</th>
            <th className="py-2">Members</th>
            <th className="py-2">Active</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.id} className="border-b">
              <td className="py-2">
                <Link href={`/intake-groups/${group.id}`} className="underline">
                  {group.label}
                </Link>
              </td>
              <td className="py-2">{group.intakeDate.toDateString()}</td>
              <td className="py-2">{group._count.animals}</td>
              <td className="py-2">{group.isActive ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {groups.length === 0 && <p className="text-sm text-gray-500">No intake groups yet.</p>}
      {canManage && (
        <form action={createIntakeGroup} className="flex w-full max-w-xs flex-col gap-2 text-sm">
          <h2 className="text-sm font-semibold">Add intake group</h2>
          <input type="text" name="label" placeholder="label (e.g. Irish Group)" required className="rounded border px-2 py-1" />
          <input type="date" name="intakeDate" required className="rounded border px-2 py-1" />
          <input type="text" name="notes" placeholder="notes" className="rounded border px-2 py-1" />
          <button type="submit" className="w-fit rounded bg-black px-4 py-2 text-xs text-white">
            Add group
          </button>
        </form>
      )}
    </main>
  )
}
