import { notFound } from "next/navigation"
import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { AnimalFormFields } from "../../AnimalFormFields"
import { updateAnimal } from "../../actions"

async function checkAccess() {
  try {
    await requireRole(["ADMIN"])
    return true
  } catch {
    return false
  }
}

export default async function EditAnimalPage({ params }: { params: Promise<{ id: string }> }) {
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

  const animal = await prisma.animal.findUnique({ where: { id } })
  if (!animal) notFound()

  const updateAnimalWithId = updateAnimal.bind(null, animal.id)

  return (
    <main className="flex flex-1 flex-col items-center gap-4 p-8">
      <h1 className="text-xl font-semibold">Edit {animal.name}</h1>
      <form action={updateAnimalWithId} className="flex w-full max-w-sm flex-col gap-3">
        <AnimalFormFields defaults={animal} />
        <button type="submit" className="mt-2 rounded bg-black px-4 py-2 text-sm text-white">
          Save changes
        </button>
      </form>
    </main>
  )
}
