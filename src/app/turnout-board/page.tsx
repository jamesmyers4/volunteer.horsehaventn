import Link from "next/link"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createLocationAssignment } from "@/app/animals/[id]/location-actions"

// V2.md Session 6: read-only large-screen display grouped by Location, built on the Session
// 1 Location/AnimalLocationAssignment model — no new location data, just a new read path plus
// an inline "correct a move on the spot" affordance for Admin/Shift-Lead.
export default async function TurnoutBoardPage({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const volunteer = await requireVolunteer()
  const canEdit = volunteer.role === "ADMIN" || volunteer.role === "SHIFT_LEAD"

  const { period: periodParam } = await searchParams
  const period: "DAY" | "NIGHT" = periodParam === "NIGHT" ? "NIGHT" : "DAY"

  // Day view groups by turnout FIELD locations (the manual's field map); night view groups by
  // everything else (barn stalls, sick bay, arena) — matches how the barn actually operates
  // (turned out to fields by day, brought in to the barn at night).
  const locations = await prisma.location.findMany({
    where: period === "DAY" ? { isActive: true, type: "FIELD" } : { isActive: true, type: { not: "FIELD" } },
    orderBy:
      period === "DAY"
        ? [{ turnoutOrder: "asc" }, { fieldCode: "asc" }]
        : [{ type: "asc" }, { barnNumber: "asc" }, { stallNumber: "asc" }, { name: "asc" }]
  })

  // Every active location, for the "move to" select — not just the ones shown for this
  // period, since a correction might move an animal to a location type outside the current
  // toggle (e.g. moving a DAY assignment into sick bay).
  const allLocations = await prisma.location.findMany({
    where: { isActive: true },
    orderBy: [{ type: "asc" }, { fieldCode: "asc" }, { name: "asc" }]
  })

  const currentAssignments = await prisma.animalLocationAssignment.findMany({
    where: { period },
    orderBy: [{ animalId: "asc" }, { effectiveAt: "desc" }],
    distinct: ["animalId"],
    include: { animal: true }
  })

  const occupantsByLocation = new Map<string, typeof currentAssignments>()
  for (const assignment of currentAssignments) {
    if (assignment.animal.status !== "ACTIVE") continue
    const list = occupantsByLocation.get(assignment.locationId) ?? []
    list.push(assignment)
    occupantsByLocation.set(assignment.locationId, list)
  }
  // Herd hierarchy: lower herdOrder ranks higher (lead animal at top); unranked animals
  // (herdOrder null) sort after every ranked animal and fall back to alphabetical among
  // themselves — see Animal.herdOrder's schema comment for why this field exists.
  for (const occupants of occupantsByLocation.values()) {
    occupants.sort((a, b) => {
      const orderA = a.animal.herdOrder
      const orderB = b.animal.herdOrder
      if (orderA != null && orderB != null) return orderA - orderB
      if (orderA != null) return -1
      if (orderB != null) return 1
      return a.animal.name.localeCompare(b.animal.name)
    })
  }

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <div>
        <h1 className="text-xl font-semibold">Turnout Board</h1>
        <p className="text-sm text-gray-500">
          Grouped by {period === "DAY" ? "field" : "barn/stall"}, lead animal at top of each list. Read-only here; Admin/Shift-Lead can
          correct a location on the spot on a desktop screen.
        </p>
        <div className="mt-2 flex gap-4 text-sm">
          <Link href="/turnout-board?period=DAY" className={period === "DAY" ? "font-semibold underline" : "underline text-gray-500"}>
            Day (fields)
          </Link>
          <Link href="/turnout-board?period=NIGHT" className={period === "NIGHT" ? "font-semibold underline" : "underline text-gray-500"}>
            Night (barn)
          </Link>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {locations.map((location) => {
          const occupants = occupantsByLocation.get(location.id) ?? []

          const listContent = (
            <ul className="flex flex-col gap-2 text-sm">
              {occupants.length === 0 && <li className="text-gray-500">No horses currently assigned.</li>}
              {occupants.map((assignment) => {
                const moveAnimal = createLocationAssignment.bind(null, assignment.animalId)
                return (
                  <li key={assignment.id} className="border-b pb-1">
                    <Link href={`/animals/${assignment.animalId}`} className="underline">
                      {assignment.animal.name}
                    </Link>
                    {canEdit && (
                      <form action={moveAnimal} className="hidden lg:flex lg:items-center lg:gap-1 lg:pt-1">
                        <input type="hidden" name="period" value={period} />
                        <input type="hidden" name="redirectTo" value={`/turnout-board?period=${period}`} />
                        <select name="locationId" defaultValue={location.id} className="rounded border px-1 py-0.5 text-xs">
                          {allLocations.map((loc) => (
                            <option key={loc.id} value={loc.id}>
                              {loc.fieldCode ?? loc.name}
                            </option>
                          ))}
                        </select>
                        <button type="submit" className="rounded border px-2 py-0.5 text-xs">
                          Move
                        </button>
                      </form>
                    )}
                  </li>
                )
              })}
            </ul>
          )

          return (
            <section key={location.id} id={`location-${location.id}`} className="rounded border p-3">
              <h2 className="text-sm font-semibold">{location.fieldCode ?? location.name}</h2>
              {/* TV/desktop: always expanded, no tap needed. Mobile: collapsed behind a native
                  <details> tap-to-reveal, no forced landscape — both are pure CSS breakpoint
                  variants of the same data, no client JS involved. */}
              <div className="hidden lg:block lg:pt-2">{listContent}</div>
              <details className="pt-2 lg:hidden">
                <summary className="cursor-pointer text-xs text-gray-500">
                  {occupants.length} horse{occupants.length === 1 ? "" : "s"} — tap to view
                </summary>
                <div className="pt-2">{listContent}</div>
              </details>
            </section>
          )
        })}
      </div>
      {locations.length === 0 && <p className="text-sm text-gray-500">No locations configured for this view.</p>}
    </main>
  )
}
