import Link from "next/link"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createLocation } from "./actions"

export default async function LocationsPage() {
  const volunteer = await requireVolunteer()

  const locations = await prisma.location.findMany({
    where: { isActive: true },
    orderBy: [{ type: "asc" }, { fieldCode: "asc" }, { name: "asc" }]
  })

  // Each animal's current DAY-period location, derived (not stored) as the latest
  // effectiveAt row per animal — same DISTINCT ON pattern the dashboard already uses.
  const currentDayAssignments = await prisma.animalLocationAssignment.findMany({
    where: { period: "DAY" },
    orderBy: [{ animalId: "asc" }, { effectiveAt: "desc" }],
    distinct: ["animalId"],
    include: { animal: true }
  })
  const occupantsByLocation = new Map<string, typeof currentDayAssignments>()
  for (const assignment of currentDayAssignments) {
    const list = occupantsByLocation.get(assignment.locationId) ?? []
    list.push(assignment)
    occupantsByLocation.set(assignment.locationId, list)
  }

  const canManageLocations = volunteer.role === "ADMIN"

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">Locations</h1>
      <p className="text-sm text-gray-500">
        Plain list view — the interactive drone-photo map is a Phase 2 item. To move a horse, use the Location section on that horse&apos;s detail page.
      </p>
      <table className="w-full max-w-2xl text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Location</th>
            <th className="py-2">Currently in (day)</th>
            <th className="py-2">Turnout order</th>
            <th className="py-2">Bring-in order</th>
          </tr>
        </thead>
        <tbody>
          {locations.map((location) => (
            <tr key={location.id} className="border-b align-top">
              <td className="py-2">
                <span className="font-semibold">{location.fieldCode ?? location.name}</span>
                <span className="text-gray-500"> ({location.type})</span>
              </td>
              <td className="py-2">
                {(occupantsByLocation.get(location.id) ?? []).length === 0 ? (
                  <span className="text-gray-500">—</span>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {(occupantsByLocation.get(location.id) ?? []).map((assignment) => (
                      <li key={assignment.id}>
                        <Link href={`/animals/${assignment.animal.id}`} className="underline">
                          {assignment.animal.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="py-2">{location.turnoutOrder ?? "—"}</td>
              <td className="py-2">{location.bringInOrder ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {locations.length === 0 && <p className="text-sm text-gray-500">No locations configured.</p>}
      {canManageLocations && (
        <form action={createLocation} className="flex w-full max-w-xs flex-col gap-2 text-sm">
          <h2 className="text-sm font-semibold">Add location</h2>
          <select name="type" required defaultValue="FIELD" className="rounded border px-2 py-1">
            <option value="FIELD">Field</option>
            <option value="BARN_STALL">Barn stall</option>
            <option value="SICK_BAY">Sick bay</option>
            <option value="ARENA">Arena</option>
            <option value="OTHER">Other</option>
          </select>
          <input type="text" name="name" placeholder="name" required className="rounded border px-2 py-1" />
          <input type="text" name="fieldCode" placeholder="field code (FIELD only, e.g. L7)" className="rounded border px-2 py-1" />
          <input type="number" name="barnNumber" placeholder="barn number (BARN_STALL only)" className="rounded border px-2 py-1" />
          <input type="number" name="stallNumber" placeholder="stall number (BARN_STALL only)" className="rounded border px-2 py-1" />
          <button type="submit" className="w-fit rounded bg-black px-4 py-2 text-xs text-white">
            Add location
          </button>
        </form>
      )}
    </main>
  )
}
