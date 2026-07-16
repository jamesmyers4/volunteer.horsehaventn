import Link from "next/link"
import { notFound } from "next/navigation"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export default async function HorseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireVolunteer()
  const { id } = await params
  const horse = await prisma.horse.findUnique({ where: { id } })

  if (!horse) notFound()

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
      <p className="text-sm text-gray-400">Photos coming once R2 is wired up.</p>
    </main>
  )
}
