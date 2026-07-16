import Link from "next/link"
import { notFound } from "next/navigation"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export default async function HorseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireVolunteer()
  const { id } = await params
  const horse = await prisma.horse.findUnique({ where: { id } })

  if (!horse) notFound()

  const photos = await prisma.horsePhoto.findMany({ where: { horseId: id }, orderBy: { takenAt: "desc" } })

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
    </main>
  )
}
