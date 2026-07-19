import Link from "next/link"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export default async function DashboardPage() {
  await requireVolunteer()

  const today = new Date(new Date().toISOString().slice(0, 10))
  const tomorrow = new Date(today)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

  const animals = await prisma.animal.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } })
  const animalIds = animals.map((a) => a.id)

  const dayLocationAssignments = await prisma.animalLocationAssignment.findMany({
    where: { animalId: { in: animalIds }, period: "DAY" },
    include: { location: true },
    orderBy: [{ animalId: "asc" }, { effectiveAt: "desc" }],
    distinct: ["animalId"]
  })
  const locationByAnimal = new Map(dayLocationAssignments.map((a) => [a.animalId, a]))

  const feedingBaselines = await prisma.feedingBaseline.findMany({
    where: { animalId: { in: animalIds } },
    include: { feedType: true, overrides: { where: { date: { gte: today, lt: tomorrow } } } },
    orderBy: [{ shift: "asc" }, { feedType: { name: "asc" } }]
  })
  const feedingByAnimal = new Map<string, typeof feedingBaselines>()
  for (const baseline of feedingBaselines) {
    const list = feedingByAnimal.get(baseline.animalId) ?? []
    list.push(baseline)
    feedingByAnimal.set(baseline.animalId, list)
  }

  const medicationRegimens = await prisma.medicationRegimen.findMany({
    where: { animalId: { in: animalIds }, OR: [{ endDate: null }, { endDate: { gte: today } }] },
    include: { logs: { where: { date: { gte: today, lt: tomorrow } } } },
    orderBy: { drugName: "asc" }
  })
  const medicationByAnimal = new Map<string, typeof medicationRegimens>()
  for (const regimen of medicationRegimens) {
    const list = medicationByAnimal.get(regimen.animalId) ?? []
    list.push(regimen)
    medicationByAnimal.set(regimen.animalId, list)
  }

  const openHealthIssues = await prisma.healthIssue.findMany({
    where: { animalId: { in: animalIds }, active: true },
    orderBy: { startDate: "desc" }
  })
  const healthByAnimal = new Map<string, typeof openHealthIssues>()
  for (const issue of openHealthIssues) {
    const list = healthByAnimal.get(issue.animalId) ?? []
    list.push(issue)
    healthByAnimal.set(issue.animalId, list)
  }

  const lastCareEntries = await prisma.careEntry.findMany({
    where: { animalId: { in: animalIds } },
    include: { careType: true },
    orderBy: [{ animalId: "asc" }, { date: "desc" }],
    distinct: ["animalId"]
  })
  const lastCareByAnimal = new Map(lastCareEntries.map((e) => [e.animalId, e]))

  const lastWeightEntries = await prisma.weightEntry.findMany({
    where: { animalId: { in: animalIds } },
    orderBy: [{ animalId: "asc" }, { date: "desc" }],
    distinct: ["animalId"]
  })
  const lastWeightByAnimal = new Map(lastWeightEntries.map((e) => [e.animalId, e]))

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <div>
        <h1 className="text-xl font-semibold">Daily Dashboard</h1>
        <p className="text-sm text-gray-500">
          One row per active horse — feeding, medication, health, weight, and location at a glance. Read-only; log or edit from a horse&apos;s own page.
        </p>
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2 pr-4">Horse</th>
            <th className="py-2 pr-4">Location</th>
            <th className="py-2 pr-4">Feeding today</th>
            <th className="py-2 pr-4">Medication today</th>
            <th className="py-2 pr-4">Health</th>
            <th className="py-2">Last weight</th>
          </tr>
        </thead>
        <tbody>
          {animals.map((animal) => {
            const location = locationByAnimal.get(animal.id)
            const baselines = feedingByAnimal.get(animal.id) ?? []
            const regimens = medicationByAnimal.get(animal.id) ?? []
            const issues = healthByAnimal.get(animal.id) ?? []
            const lastCare = lastCareByAnimal.get(animal.id)
            const lastWeight = lastWeightByAnimal.get(animal.id)

            return (
              <tr key={animal.id} className="border-b align-top">
                <td className="py-2 pr-4">
                  <Link href={`/animals/${animal.id}`} className="font-medium underline">
                    {animal.name}
                  </Link>
                  <div className="text-xs text-gray-500">{animal.requiredHandlerColor}</div>
                </td>
                <td className="py-2 pr-4">
                  {location ? location.location.fieldCode ?? location.location.name : <span className="text-gray-500">unassigned</span>}
                </td>
                <td className="py-2 pr-4">
                  {baselines.length === 0 ? (
                    <span className="text-gray-500">No plan</span>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {baselines.map((baseline) => {
                        const override = baseline.overrides[0]
                        return (
                          <li key={baseline.id}>
                            <span className="text-gray-500">{baseline.shift}</span> {baseline.feedType.name}{" "}
                            {override ? (
                              <span className="text-amber-700">
                                →{" "}
                                {override.amount
                                  ? `${override.amount.toString()} ${baseline.feedType.defaultUnit.toLowerCase()}`
                                  : override.reason ?? "override logged"}
                              </span>
                            ) : (
                              <span>
                                {baseline.amount.toString()} {baseline.feedType.defaultUnit.toLowerCase()}
                              </span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {regimens.length === 0 ? (
                    <span className="text-gray-500">None</span>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {regimens.map((regimen) => {
                        const log = regimen.logs[0]
                        const statusText = log ? (log.administered ? "given" : "missed") : "pending"
                        const statusColor = log ? (log.administered ? "text-green-700" : "text-red-700") : "text-amber-700"
                        return (
                          <li key={regimen.id}>
                            {regimen.drugName} <span className={statusColor}>({statusText})</span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {issues.length === 0 ? (
                    <span className="text-gray-500">—</span>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {issues.map((issue) => (
                        <li key={issue.id} className="text-red-700">
                          {issue.description}
                        </li>
                      ))}
                    </ul>
                  )}
                  {lastCare && (
                    <div className="text-xs text-gray-500">
                      Last care: {lastCare.date.toDateString()} ({lastCare.careType.name})
                    </div>
                  )}
                </td>
                <td className="py-2">
                  {lastWeight ? (
                    <span>
                      {lastWeight.weight.toString()} lbs <span className="text-gray-500">({lastWeight.date.toDateString()})</span>
                    </span>
                  ) : (
                    <span className="text-gray-500">—</span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {animals.length === 0 && <p className="text-sm text-gray-500">No active horses to show.</p>}
    </main>
  )
}
