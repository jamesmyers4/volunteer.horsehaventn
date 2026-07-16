import { notFound } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { HorseFormFields } from "../../HorseFormFields"
import { updateHorse } from "../../actions"

async function checkAccess() {
  try {
    await requireRole(["ADMIN"])
    return true
  } catch {
    return false
  }
}

export default async function EditHorsePage({ params }: { params: Promise<{ id: string }> }) {
  const authorized = await checkAccess()
  const { id } = await params

  if (!authorized) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <h1 className="text-xl font-semibold">Not authorized</h1>
        <p className="text-sm text-gray-500">Editing a horse requires an ADMIN-role account.</p>
      </main>
    )
  }

  const horse = await prisma.horse.findUnique({ where: { id } })
  if (!horse) notFound()

  const updateHorseWithId = updateHorse.bind(null, horse.id)

  return (
    <main className="flex flex-1 flex-col items-center gap-4 p-8">
      <h1 className="text-xl font-semibold">Edit {horse.name}</h1>
      <form action={updateHorseWithId} className="flex w-full max-w-sm flex-col gap-3">
        <HorseFormFields defaults={horse} />
        <button type="submit" className="mt-2 rounded bg-black px-4 py-2 text-sm text-white">
          Save changes
        </button>
      </form>
    </main>
  )
}
