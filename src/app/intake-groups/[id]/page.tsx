import Link from "next/link"
import { notFound } from "next/navigation"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { updateIntakeGroup } from "../actions"

export default async function IntakeGroupDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const volunteer = await requireVolunteer()
  const { id } = await params
  const canManage = volunteer.role === "ADMIN"

  const group = await prisma.intakeGroup.findUnique({
    where: { id },
    include: { animals: { orderBy: { name: "asc" } } }
  })
  if (!group) notFound()

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{group.label}</h1>
        <Link href="/intake-groups" className="text-sm underline">
          All intake groups
        </Link>
      </div>
      <dl className="grid max-w-md grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-gray-500">Intake date</dt>
        <dd>{group.intakeDate.toDateString()}</dd>
        <dt className="text-gray-500">Active</dt>
        <dd>{group.isActive ? "Yes" : "No"}</dd>
        {group.notes && (
          <>
            <dt className="text-gray-500">Notes</dt>
            <dd>{group.notes}</dd>
          </>
        )}
      </dl>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Members</h2>
        {group.animals.length === 0 && <p className="text-sm text-gray-500">No animals assigned to this group yet.</p>}
        <ul className="flex flex-col gap-1 text-sm">
          {group.animals.map((animal) => (
            <li key={animal.id}>
              <Link href={`/animals/${animal.id}`} className="underline">
                {animal.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {canManage && (
        <form action={updateIntakeGroup.bind(null, group.id)} className="flex w-full max-w-xs flex-col gap-2 text-sm">
          <h2 className="text-sm font-semibold">Edit group</h2>
          <input type="text" name="label" defaultValue={group.label} required className="rounded border px-2 py-1" />
          <input type="date" name="intakeDate" defaultValue={group.intakeDate.toISOString().slice(0, 10)} required className="rounded border px-2 py-1" />
          <input type="text" name="notes" defaultValue={group.notes ?? ""} placeholder="notes" className="rounded border px-2 py-1" />
          <label className="flex items-center gap-2">
            <input type="checkbox" name="isActive" defaultChecked={group.isActive} />
            Active
          </label>
          <button type="submit" className="w-fit rounded border px-4 py-2 text-xs">
            Save
          </button>
        </form>
      )}
    </main>
  )
}
