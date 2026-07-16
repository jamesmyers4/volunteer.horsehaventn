import { requireRole } from "@/lib/auth"
import { HorseFormFields } from "../HorseFormFields"
import { createHorse } from "../actions"

async function checkAccess() {
  try {
    await requireRole(["ADMIN"])
    return true
  } catch {
    return false
  }
}

export default async function NewHorsePage() {
  const authorized = await checkAccess()

  if (!authorized) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <h1 className="text-xl font-semibold">Not authorized</h1>
        <p className="text-sm text-gray-500">Adding a horse requires an ADMIN-role account.</p>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-4 p-8">
      <h1 className="text-xl font-semibold">Add horse</h1>
      <form action={createHorse} className="flex w-full max-w-sm flex-col gap-3">
        <HorseFormFields />
        <button type="submit" className="mt-2 rounded bg-black px-4 py-2 text-sm text-white">
          Create horse
        </button>
      </form>
    </main>
  )
}
