import Link from "next/link"
import { notFound } from "next/navigation"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createFeedingBaseline, createFeedingOverride } from "./feeding-actions"
import { createMedicationRegimen, endMedicationRegimen, logMedicationAdministered } from "./medication-actions"
import { createCareEntry, createHealthIssue, resolveHealthIssue } from "./care-actions"
import { createWeightEntry, createAnimalMetric } from "./metrics-actions"
import { createLocationAssignment } from "./location-actions"
import { getLocationHistory, currentFromHistory } from "@/lib/locations"
import { HeadshotCropUpload } from "./HeadshotCropUpload"

export default async function AnimalDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const volunteer = await requireVolunteer()
  const { id } = await params
  const animal = await prisma.animal.findUnique({ where: { id } })

  if (!animal) notFound()

  const photos = await prisma.animalPhoto.findMany({ where: { animalId: id }, orderBy: { takenAt: "desc" } })

  const today = new Date(new Date().toISOString().slice(0, 10))
  const tomorrow = new Date(today)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

  const feedingBaselines = await prisma.feedingBaseline.findMany({
    where: { animalId: id },
    include: { feedType: true, overrides: { where: { date: { gte: today, lt: tomorrow } } } },
    orderBy: [{ shift: "asc" }, { feedType: { name: "asc" } }]
  })

  const feedTypes = await prisma.feedType.findMany({ where: { active: true }, orderBy: { name: "asc" } })

  const medicationRegimens = await prisma.medicationRegimen.findMany({
    where: { animalId: id, OR: [{ endDate: null }, { endDate: { gte: today } }] },
    include: { logs: { where: { date: { gte: today, lt: tomorrow } } } },
    orderBy: { drugName: "asc" }
  })

  const careTypes = await prisma.careType.findMany({ where: { active: true }, orderBy: { name: "asc" } })

  const careEntries = await prisma.careEntry.findMany({
    where: { animalId: id },
    include: { careType: true, healthIssue: true },
    orderBy: { date: "desc" },
    take: 15
  })

  const healthIssues = await prisma.healthIssue.findMany({
    where: { animalId: id, active: true },
    orderBy: { startDate: "desc" }
  })

  const weightEntries = await prisma.weightEntry.findMany({
    where: { animalId: id },
    orderBy: { date: "desc" },
    take: 10
  })

  const animalMetrics = await prisma.animalMetric.findMany({
    where: { animalId: id },
    include: { metricType: true },
    orderBy: { date: "desc" },
    take: 10
  })

  const metricTypes = await prisma.metricType.findMany({ where: { active: true }, orderBy: { name: "asc" } })

  // Append-only (V2.md Session 1): "current" per period is derived as the latest
  // effectiveAt row, not a stored pointer — full history stays queryable but is only
  // surfaced behind the "View history" expand below, not shown by default.
  const locationAssignments = await getLocationHistory(id)
  const { day: currentDayAssignment, night: currentNightAssignment } = currentFromHistory(locationAssignments)

  const locations = await prisma.location.findMany({
    where: { isActive: true },
    orderBy: [{ type: "asc" }, { fieldCode: "asc" }, { name: "asc" }]
  })

  const performerIds = Array.from(
    new Set([
      ...medicationRegimens.flatMap((r) => r.logs.map((l) => l.administeredBy)),
      ...careEntries.map((e) => e.performedBy),
      ...weightEntries.map((w) => w.recordedBy),
      ...animalMetrics.map((m) => m.recordedBy)
    ])
  )
  const performers = await prisma.volunteer.findMany({ where: { id: { in: performerIds } } })
  const performerNames = new Map(performers.map((p) => [p.id, p.name]))

  const canManageBaseline = volunteer.role === "ADMIN"
  const canLogOverride = volunteer.role === "ADMIN" || volunteer.role === "SHIFT_LEAD"
  const canManageMedicationRegimen = volunteer.role === "ADMIN"
  const canLogMedication = volunteer.role === "ADMIN" || volunteer.role === "SHIFT_LEAD"
  const canManageCare = volunteer.role === "ADMIN" || volunteer.role === "SHIFT_LEAD"
  const canLogMetrics = volunteer.role === "ADMIN" || volunteer.role === "SHIFT_LEAD"
  const canAssignLocation = volunteer.role === "ADMIN" || volunteer.role === "SHIFT_LEAD"

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{animal.name}</h1>
        <Link href={`/animals/${animal.id}/edit`} className="rounded border px-4 py-2 text-sm">
          Edit
        </Link>
      </div>
      <dl className="grid max-w-md grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-gray-500">Status</dt>
        <dd>{animal.status}</dd>
        <dt className="text-gray-500">Sex</dt>
        <dd>
          {animal.sex}
          {animal.spayed ? " (spayed)" : ""}
        </dd>
        <dt className="text-gray-500">Intake date</dt>
        <dd>{animal.intakeDate ? animal.intakeDate.toDateString() : "—"}</dd>
        <dt className="text-gray-500">Handling color</dt>
        <dd>{animal.requiredHandlerColor}</dd>
        <dt className="text-gray-500">Legal case</dt>
        <dd>{animal.legalCase ? animal.caseReference || "Yes" : "No"}</dd>
        {animal.handlingNotes && (
          <>
            <dt className="text-gray-500">Handling notes</dt>
            <dd>{animal.handlingNotes}</dd>
          </>
        )}
        {animal.notes && (
          <>
            <dt className="text-gray-500">Notes</dt>
            <dd>{animal.notes}</dd>
          </>
        )}
      </dl>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Photos</h2>
        <div className="flex flex-wrap gap-3">
          {photos.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={photo.id} src={photo.url} alt={`${animal.name} - ${photo.type}`} className="h-32 w-32 rounded object-cover" />
          ))}
          {photos.length === 0 && <p className="text-sm text-gray-500">No photos yet.</p>}
        </div>
        {/* Headshot uploads go through the client-side square-crop tool (V2.md Session 6 —
            the Feed Board needs a standardized square headshot per animal). Other photo
            types keep the plain multipart Route Handler form unchanged. */}
        <HeadshotCropUpload animalId={animal.id} />
        <form action={`/api/animals/${animal.id}/photos`} method="post" encType="multipart/form-data" className="flex flex-col gap-2 text-sm">
          <input type="file" name="file" accept="image/*" required />
          <select name="type" className="rounded border px-2 py-1">
            <option value="MAP">Map (full body)</option>
            <option value="PROGRESS">Progress</option>
            <option value="OTHER">Other</option>
          </select>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="isPrimary" />
            Set as primary for this type
          </label>
          <button type="submit" className="rounded border px-4 py-2">
            Upload photo
          </button>
        </form>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Feeding</h2>
        <table className="w-full max-w-xl text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Shift</th>
              <th className="py-2">Feed</th>
              <th className="py-2">Amount</th>
              <th className="py-2">Soak</th>
              <th className="py-2">Today</th>
            </tr>
          </thead>
          <tbody>
            {feedingBaselines.map((baseline) => {
              const todayOverride = baseline.overrides[0]
              const createOverrideForBaseline = createFeedingOverride.bind(null, baseline.id, animal.id)
              return (
                <tr key={baseline.id} className="border-b align-top">
                  <td className="py-2">{baseline.shift}</td>
                  <td className="py-2">{baseline.feedType.name}</td>
                  <td className="py-2">
                    {baseline.amount.toString()} {baseline.feedType.defaultUnit.toLowerCase()}
                  </td>
                  <td className="py-2">{baseline.requiresSoaking ? "Yes" : "No"}</td>
                  <td className="py-2">
                    {todayOverride ? (
                      <span>
                        {todayOverride.amount ? `${todayOverride.amount.toString()} ${baseline.feedType.defaultUnit.toLowerCase()} — ` : ""}
                        {todayOverride.reason ?? "override logged"}
                      </span>
                    ) : canLogOverride ? (
                      <form action={createOverrideForBaseline} className="flex flex-col gap-1">
                        <input type="number" step="0.25" name="amount" placeholder="amount (optional)" className="w-32 rounded border px-1 py-0.5 text-xs" />
                        <input type="text" name="reason" placeholder="reason" className="w-32 rounded border px-1 py-0.5 text-xs" />
                        <button type="submit" className="w-fit rounded border px-2 py-0.5 text-xs">
                          Log for today
                        </button>
                      </form>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {feedingBaselines.length === 0 && <p className="text-sm text-gray-500">No feeding plan set yet.</p>}
        {canManageBaseline && (
          <form action={createFeedingBaseline.bind(null, animal.id)} className="flex w-full max-w-sm flex-col gap-2 text-sm">
            <h3 className="text-xs font-semibold text-gray-500">Add feeding baseline</h3>
            <select name="feedTypeId" required className="rounded border px-2 py-1">
              {feedTypes.map((feedType) => (
                <option key={feedType.id} value={feedType.id}>
                  {feedType.name}
                </option>
              ))}
            </select>
            <div className="flex gap-4">
              <label className="flex items-center gap-1">
                <input type="radio" name="shift" value="AM" defaultChecked required />
                AM
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" name="shift" value="PM" required />
                PM
              </label>
            </div>
            <input type="number" step="0.25" name="amount" placeholder="amount" required className="rounded border px-2 py-1" />
            <label className="flex items-center gap-2">
              <input type="checkbox" name="requiresSoaking" defaultChecked />
              Requires soaking
            </label>
            <input type="text" name="notes" placeholder="notes" className="rounded border px-2 py-1" />
            <button type="submit" className="w-fit rounded bg-black px-4 py-2 text-xs text-white">
              Add baseline
            </button>
          </form>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Medication</h2>
        <table className="w-full max-w-2xl text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Drug</th>
              <th className="py-2">Dose</th>
              <th className="py-2">Route</th>
              <th className="py-2">Frequency</th>
              <th className="py-2">Today</th>
            </tr>
          </thead>
          <tbody>
            {medicationRegimens.map((regimen) => {
              const todayLog = regimen.logs[0]
              const logForRegimen = logMedicationAdministered.bind(null, regimen.id, animal.id)
              const endForRegimen = endMedicationRegimen.bind(null, regimen.id, animal.id)
              return (
                <tr key={regimen.id} className="border-b align-top">
                  <td className="py-2">{regimen.drugName}</td>
                  <td className="py-2">{regimen.dose}</td>
                  <td className="py-2">{regimen.route ?? "—"}</td>
                  <td className="py-2">{regimen.frequency}</td>
                  <td className="py-2">
                    {todayLog ? (
                      <span>
                        {todayLog.administered ? "Given" : "Missed"} — {performerNames.get(todayLog.administeredBy) ?? todayLog.administeredBy}
                        {todayLog.notes ? ` (${todayLog.notes})` : ""}
                      </span>
                    ) : canLogMedication ? (
                      <form action={logForRegimen} className="flex flex-col gap-1">
                        <div className="flex gap-3">
                          <label className="flex items-center gap-1">
                            <input type="radio" name="administered" value="true" defaultChecked required />
                            Given
                          </label>
                          <label className="flex items-center gap-1">
                            <input type="radio" name="administered" value="false" required />
                            Missed
                          </label>
                        </div>
                        <input type="text" name="notes" placeholder="notes" className="w-40 rounded border px-1 py-0.5 text-xs" />
                        <button type="submit" className="w-fit rounded border px-2 py-0.5 text-xs">
                          Log for today
                        </button>
                      </form>
                    ) : (
                      "—"
                    )}
                    {canManageMedicationRegimen && (
                      <form action={endForRegimen}>
                        <button type="submit" className="mt-1 w-fit text-xs text-gray-500 underline">
                          End regimen
                        </button>
                      </form>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {medicationRegimens.length === 0 && <p className="text-sm text-gray-500">No active medication regimens.</p>}
        {canManageMedicationRegimen && (
          <form action={createMedicationRegimen.bind(null, animal.id)} className="flex w-full max-w-sm flex-col gap-2 text-sm">
            <h3 className="text-xs font-semibold text-gray-500">Add medication regimen</h3>
            <input type="text" name="drugName" placeholder="drug name" required className="rounded border px-2 py-1" />
            <input type="text" name="dose" placeholder="dose" required className="rounded border px-2 py-1" />
            <input type="text" name="route" placeholder="route (optional)" className="rounded border px-2 py-1" />
            <input type="text" name="frequency" placeholder="frequency" required className="rounded border px-2 py-1" />
            <input type="text" name="notes" placeholder="notes" className="rounded border px-2 py-1" />
            <button type="submit" className="w-fit rounded bg-black px-4 py-2 text-xs text-white">
              Add regimen
            </button>
          </form>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Care & Health</h2>
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-gray-500">Open health issues</h3>
          {healthIssues.length === 0 && <p className="text-sm text-gray-500">None open.</p>}
          <ul className="flex flex-col gap-2 text-sm">
            {healthIssues.map((issue) => {
              const resolveForIssue = resolveHealthIssue.bind(null, issue.id, animal.id)
              return (
                <li key={issue.id} className="flex items-center justify-between gap-2 border-b pb-1">
                  <span>
                    {issue.description} <span className="text-gray-500">(since {issue.startDate.toDateString()})</span>
                  </span>
                  {canManageCare && (
                    <form action={resolveForIssue}>
                      <button type="submit" className="text-xs text-gray-500 underline">
                        Resolve
                      </button>
                    </form>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="text-xs font-semibold text-gray-500">Recent care entries</h3>
          {careEntries.length === 0 && <p className="text-sm text-gray-500">No care entries yet.</p>}
          <ul className="flex flex-col gap-1 text-sm">
            {careEntries.map((entry) => (
              <li key={entry.id} className="border-b pb-1">
                <span className="text-gray-500">{entry.date.toDateString()}</span> — {entry.careType.name} — {performerNames.get(entry.performedBy) ?? entry.performedBy}
                {entry.healthIssue ? ` (${entry.healthIssue.description})` : ""}
                {entry.notes ? `: ${entry.notes}` : ""}
              </li>
            ))}
          </ul>
        </div>
        {canManageCare && (
          <div className="flex flex-wrap gap-6">
            <form action={createCareEntry.bind(null, animal.id)} className="flex w-full max-w-sm flex-col gap-2 text-sm">
              <h3 className="text-xs font-semibold text-gray-500">Log care entry</h3>
              <select name="careTypeId" required className="rounded border px-2 py-1">
                {careTypes.map((careType) => (
                  <option key={careType.id} value={careType.id}>
                    {careType.name}
                  </option>
                ))}
              </select>
              <select name="relatedHealthIssueId" className="rounded border px-2 py-1">
                <option value="">Not related to an open issue</option>
                {healthIssues.map((issue) => (
                  <option key={issue.id} value={issue.id}>
                    {issue.description}
                  </option>
                ))}
              </select>
              <input type="text" name="notes" placeholder="notes" className="rounded border px-2 py-1" />
              <button type="submit" className="w-fit rounded bg-black px-4 py-2 text-xs text-white">
                Log entry
              </button>
            </form>
            <form action={createHealthIssue.bind(null, animal.id)} className="flex w-full max-w-sm flex-col gap-2 text-sm">
              <h3 className="text-xs font-semibold text-gray-500">Open health issue</h3>
              <input type="text" name="description" placeholder="description" required className="rounded border px-2 py-1" />
              <button type="submit" className="w-fit rounded border px-4 py-2 text-xs">
                Open issue
              </button>
            </form>
          </div>
        )}
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Metrics & Weight</h2>
        <div className="flex flex-wrap gap-8">
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-gray-500">Weight</h3>
            {weightEntries.length === 0 && <p className="text-sm text-gray-500">No weight entries yet.</p>}
            <ul className="flex flex-col gap-1 text-sm">
              {weightEntries.map((entry) => (
                <li key={entry.id} className="border-b pb-1">
                  <span className="text-gray-500">{entry.date.toDateString()}</span> — {entry.weight.toString()} lbs ({entry.context.toLowerCase()}) —{" "}
                  {performerNames.get(entry.recordedBy) ?? entry.recordedBy}
                  {entry.notes ? `: ${entry.notes}` : ""}
                </li>
              ))}
            </ul>
            {canLogMetrics && (
              <form action={createWeightEntry.bind(null, animal.id)} className="flex w-full max-w-xs flex-col gap-2 text-sm">
                <input type="number" step="0.1" name="weight" placeholder="weight (lbs)" required className="rounded border px-2 py-1" />
                <div className="flex gap-4">
                  <label className="flex items-center gap-1">
                    <input type="radio" name="context" value="ROUTINE" defaultChecked required />
                    Routine
                  </label>
                  <label className="flex items-center gap-1">
                    <input type="radio" name="context" value="ASSESSMENT" required />
                    Assessment
                  </label>
                </div>
                <input type="text" name="notes" placeholder="notes" className="rounded border px-2 py-1" />
                <button type="submit" className="w-fit rounded bg-black px-4 py-2 text-xs text-white">
                  Log weight
                </button>
              </form>
            )}
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-xs font-semibold text-gray-500">Other metrics</h3>
            {animalMetrics.length === 0 && <p className="text-sm text-gray-500">No metrics logged yet.</p>}
            <ul className="flex flex-col gap-1 text-sm">
              {animalMetrics.map((metric) => (
                <li key={metric.id} className="border-b pb-1">
                  <span className="text-gray-500">{metric.date.toDateString()}</span> — {metric.metricType.name}: {metric.value.toString()} —{" "}
                  {performerNames.get(metric.recordedBy) ?? metric.recordedBy}
                  {metric.notes ? `: ${metric.notes}` : ""}
                </li>
              ))}
            </ul>
            {canLogMetrics && (
              <form action={createAnimalMetric.bind(null, animal.id)} className="flex w-full max-w-xs flex-col gap-2 text-sm">
                <select name="metricTypeId" required className="rounded border px-2 py-1">
                  {metricTypes.map((metricType) => (
                    <option key={metricType.id} value={metricType.id}>
                      {metricType.name}
                    </option>
                  ))}
                </select>
                <input type="number" step="0.1" name="value" placeholder="value" required className="rounded border px-2 py-1" />
                <input type="text" name="notes" placeholder="notes" className="rounded border px-2 py-1" />
                <button type="submit" className="w-fit rounded bg-black px-4 py-2 text-xs text-white">
                  Log metric
                </button>
              </form>
            )}
          </div>
        </div>
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Location</h2>
        <p className="text-sm">
          Day:{" "}
          {currentDayAssignment ? (
            <span className="font-semibold">
              {currentDayAssignment.location.fieldCode ?? currentDayAssignment.location.name}{" "}
              <span className="font-normal text-gray-500">(since {currentDayAssignment.effectiveAt.toDateString()})</span>
            </span>
          ) : (
            <span className="text-gray-500">unassigned</span>
          )}
        </p>
        <p className="text-sm">
          Night:{" "}
          {currentNightAssignment ? (
            <span className="font-semibold">
              {currentNightAssignment.location.fieldCode ?? currentNightAssignment.location.name}{" "}
              <span className="font-normal text-gray-500">(since {currentNightAssignment.effectiveAt.toDateString()})</span>
            </span>
          ) : (
            <span className="text-gray-500">unassigned</span>
          )}
        </p>
        {locationAssignments.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs font-semibold text-gray-500">View history</summary>
            <ul className="mt-1 flex flex-col gap-1 text-sm">
              {locationAssignments.map((assignment) => (
                <li key={assignment.id} className="text-gray-500">
                  {assignment.period}: {assignment.location.fieldCode ?? assignment.location.name} — {assignment.effectiveAt.toDateString()}
                  {assignment.notes ? ` (${assignment.notes})` : ""}
                </li>
              ))}
            </ul>
          </details>
        )}
        {canAssignLocation && (
          <form action={createLocationAssignment.bind(null, animal.id)} className="flex w-full max-w-xs flex-col gap-2 text-sm">
            <select name="locationId" required className="rounded border px-2 py-1">
              {locations.map((location) => (
                <option key={location.id} value={location.id}>
                  {location.fieldCode ?? location.name}
                </option>
              ))}
            </select>
            <div className="flex gap-4">
              <label className="flex items-center gap-1">
                <input type="radio" name="period" value="DAY" defaultChecked required />
                Day
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" name="period" value="NIGHT" required />
                Night
              </label>
            </div>
            <input type="text" name="notes" placeholder="notes" className="rounded border px-2 py-1" />
            <button type="submit" className="w-fit rounded bg-black px-4 py-2 text-xs text-white">
              Move
            </button>
          </form>
        )}
      </section>
    </main>
  )
}
