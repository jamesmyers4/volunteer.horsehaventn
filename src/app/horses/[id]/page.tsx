import Link from "next/link"
import { notFound } from "next/navigation"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createFeedingBaseline, createFeedingOverride } from "./feeding-actions"

export default async function HorseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const volunteer = await requireVolunteer()
  const { id } = await params
  const horse = await prisma.horse.findUnique({ where: { id } })

  if (!horse) notFound()

  const photos = await prisma.horsePhoto.findMany({ where: { horseId: id }, orderBy: { takenAt: "desc" } })

  const today = new Date(new Date().toISOString().slice(0, 10))
  const tomorrow = new Date(today)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

  const feedingBaselines = await prisma.feedingBaseline.findMany({
    where: { horseId: id },
    include: { feedType: true, overrides: { where: { date: { gte: today, lt: tomorrow } } } },
    orderBy: [{ shift: "asc" }, { feedType: { name: "asc" } }]
  })

  const feedTypes = await prisma.feedType.findMany({ where: { active: true }, orderBy: { name: "asc" } })

  const canManageBaseline = volunteer.role === "ADMIN"
  const canLogOverride = volunteer.role === "ADMIN" || volunteer.role === "SHIFT_LEAD"

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">{horse.name}</h1>
        <Link href={`/horses/${horse.id}/edit`} className="rounded border px-4 py-2 text-sm">
          Edit
        </Link>
      </div>
      <dl className="grid max-w-md grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <dt className="text-gray-500">Status</dt>
        <dd>{horse.status}</dd>
        <dt className="text-gray-500">Sex</dt>
        <dd>
          {horse.sex}
          {horse.spayed ? " (spayed)" : ""}
        </dd>
        <dt className="text-gray-500">Intake date</dt>
        <dd>{horse.intakeDate ? horse.intakeDate.toDateString() : "—"}</dd>
        <dt className="text-gray-500">Handling color</dt>
        <dd>{horse.requiredHandlerColor}</dd>
        <dt className="text-gray-500">Legal case</dt>
        <dd>{horse.legalCase ? horse.caseReference || "Yes" : "No"}</dd>
        {horse.handlingNotes && (
          <>
            <dt className="text-gray-500">Handling notes</dt>
            <dd>{horse.handlingNotes}</dd>
          </>
        )}
        {horse.notes && (
          <>
            <dt className="text-gray-500">Notes</dt>
            <dd>{horse.notes}</dd>
          </>
        )}
      </dl>
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Photos</h2>
        <div className="flex flex-wrap gap-3">
          {photos.map((photo) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={photo.id} src={photo.url} alt={`${horse.name} - ${photo.type}`} className="h-32 w-32 rounded object-cover" />
          ))}
          {photos.length === 0 && <p className="text-sm text-gray-500">No photos yet.</p>}
        </div>
        <form action={`/api/horses/${horse.id}/photos`} method="post" encType="multipart/form-data" className="flex flex-col gap-2 text-sm">
          <input type="file" name="file" accept="image/*" required />
          <select name="type" className="rounded border px-2 py-1">
            <option value="PROFILE">Profile (headshot)</option>
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
              const createOverrideForBaseline = createFeedingOverride.bind(null, baseline.id, horse.id)
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
          <form action={createFeedingBaseline.bind(null, horse.id)} className="flex w-full max-w-sm flex-col gap-2 text-sm">
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
    </main>
  )
}
