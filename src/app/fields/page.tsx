import Link from "next/link"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export default async function FieldsPage() {
  await requireVolunteer()

  const fields = await prisma.field.findMany({
    where: { active: true },
    include: { assignments: { where: { endDate: null }, include: { horse: true } } },
    orderBy: { code: "asc" }
  })

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">Fields</h1>
      <p className="text-sm text-gray-500">
        Plain list view — the interactive drone-photo map is a Phase 2 item. To move a horse, use the Field / Pasture section on that horse&apos;s detail page.
      </p>
      <table className="w-full max-w-2xl text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Field</th>
            <th className="py-2">Currently in</th>
            <th className="py-2">Turnout order</th>
            <th className="py-2">Bring-in order</th>
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.id} className="border-b align-top">
              <td className="py-2">
                <span className="font-semibold">{field.code}</span>
                {field.description ? <span className="text-gray-500"> — {field.description}</span> : null}
              </td>
              <td className="py-2">
                {field.assignments.length === 0 ? (
                  <span className="text-gray-500">—</span>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {field.assignments.map((assignment) => (
                      <li key={assignment.id}>
                        <Link href={`/horses/${assignment.horse.id}`} className="underline">
                          {assignment.horse.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="py-2">{field.turnoutOrder ?? "—"}</td>
              <td className="py-2">{field.bringInOrder ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {fields.length === 0 && <p className="text-sm text-gray-500">No fields configured.</p>}
    </main>
  )
}
