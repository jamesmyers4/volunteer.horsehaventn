import Link from "next/link"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export default async function DashboardPage() {
  await requireVolunteer()

  const today = new Date(new Date().toISOString().slice(0, 10))
  const tomorrow = new Date(today)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

  const horses = await prisma.horse.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } })
  const horseIds = horses.map((h) => h.id)

  const pastureAssignments = await prisma.pastureAssignment.findMany({
    where: { horseId: { in: horseIds }, endDate: null },
    include: { field: true }
  })
  const pastureByHorse = new Map(pastureAssignments.map((a) => [a.horseId, a]))

  const feedingBaselines = await prisma.feedingBaseline.findMany({
    where: { horseId: { in: horseIds } },
    include: { feedType: true, overrides: { where: { date: { gte: today, lt: tomorrow } } } },
    orderBy: [{ shift: "asc" }, { feedType: { name: "asc" } }]
  })
  const feedingByHorse = new Map<string, typeof feedingBaselines>()
  for (const baseline of feedingBaselines) {
    const list = feedingByHorse.get(baseline.horseId) ?? []
    list.push(baseline)
    feedingByHorse.set(baseline.horseId, list)
  }

  const medicationRegimens = await prisma.medicationRegimen.findMany({
    where: { horseId: { in: horseIds }, OR: [{ endDate: null }, { endDate: { gte: today } }] },
    include: { logs: { where: { date: { gte: today, lt: tomorrow } } } },
    orderBy: { drugName: "asc" }
  })
  const medicationByHorse = new Map<string, typeof medicationRegimens>()
  for (const regimen of medicationRegimens) {
    const list = medicationByHorse.get(regimen.horseId) ?? []
    list.push(regimen)
    medicationByHorse.set(regimen.horseId, list)
  }

  const openHealthIssues = await prisma.healthIssue.findMany({
    where: { horseId: { in: horseIds }, active: true },
    orderBy: { startDate: "desc" }
  })
  const healthByHorse = new Map<string, typeof openHealthIssues>()
  for (const issue of openHealthIssues) {
    const list = healthByHorse.get(issue.horseId) ?? []
    list.push(issue)
    healthByHorse.set(issue.horseId, list)
  }

  const lastCareEntries = await prisma.careEntry.findMany({
    where: { horseId: { in: horseIds } },
    include: { careType: true },
    orderBy: [{ horseId: "asc" }, { date: "desc" }],
    distinct: ["horseId"]
  })
  const lastCareByHorse = new Map(lastCareEntries.map((e) => [e.horseId, e]))

  const lastWeightEntries = await prisma.weightEntry.findMany({
    where: { horseId: { in: horseIds } },
    orderBy: [{ horseId: "asc" }, { date: "desc" }],
    distinct: ["horseId"]
  })
  const lastWeightByHorse = new Map(lastWeightEntries.map((e) => [e.horseId, e]))

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <div>
        <h1 className="text-xl font-semibold">Daily Dashboard</h1>
        <p className="text-sm text-gray-500">
          One row per active horse — feeding, medication, health, weight, and pasture at a glance. Read-only; log or edit from a horse&apos;s own page.
        </p>
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2 pr-4">Horse</th>
            <th className="py-2 pr-4">Pasture</th>
            <th className="py-2 pr-4">Feeding today</th>
            <th className="py-2 pr-4">Medication today</th>
            <th className="py-2 pr-4">Health</th>
            <th className="py-2">Last weight</th>
          </tr>
        </thead>
        <tbody>
          {horses.map((horse) => {
            const pasture = pastureByHorse.get(horse.id)
            const baselines = feedingByHorse.get(horse.id) ?? []
            const regimens = medicationByHorse.get(horse.id) ?? []
            const issues = healthByHorse.get(horse.id) ?? []
            const lastCare = lastCareByHorse.get(horse.id)
            const lastWeight = lastWeightByHorse.get(horse.id)

            return (
              <tr key={horse.id} className="border-b align-top">
                <td className="py-2 pr-4">
                  <Link href={`/horses/${horse.id}`} className="font-medium underline">
                    {horse.name}
                  </Link>
                  <div className="text-xs text-gray-500">{horse.requiredHandlerColor}</div>
                </td>
                <td className="py-2 pr-4">{pasture ? pasture.field.code : <span className="text-gray-500">unassigned</span>}</td>
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
      {horses.length === 0 && <p className="text-sm text-gray-500">No active horses to show.</p>}
    </main>
  )
}
