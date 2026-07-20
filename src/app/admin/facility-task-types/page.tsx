import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { updateFacilityTaskType } from "./actions"

async function checkAccess() {
  try {
    await requireRole(["ADMIN"])
    return true
  } catch {
    return false
  }
}

export default async function AdminFacilityTaskTypesPage() {
  const authorized = await checkAccess()

  if (!authorized) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <h1 className="text-xl font-semibold">Not authorized</h1>
        <p className="text-sm text-gray-500">Managing facility task types requires an ADMIN-role account.</p>
      </main>
    )
  }

  const taskTypes = await prisma.facilityTaskType.findMany({ orderBy: { category: "asc" } })

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">Facility Task Types</h1>
      <p className="text-sm text-gray-500">
        Trough cleaning, stall cleaning, and strip-out cleaning — a fixed set of three (the underlying category is a hard enum, one row
        each), so only the display name and active status are editable here. No create/delete: category can&apos;t change on an existing
        row, and there&apos;s no fourth category to add one for.
      </p>

      <table className="w-full max-w-xl text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Category</th>
            <th className="py-2">Edit</th>
          </tr>
        </thead>
        <tbody>
          {taskTypes.map((taskType) => (
            <tr key={taskType.id} className="border-b align-top">
              <td className="py-2 text-xs text-gray-500">{taskType.category}</td>
              <td className="py-2">
                <form action={updateFacilityTaskType.bind(null, taskType.id)} className="flex flex-wrap items-center gap-2">
                  <input type="text" name="name" defaultValue={taskType.name} required className="rounded border px-2 py-1 text-xs" />
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="active" defaultChecked={taskType.active} />
                    active
                  </label>
                  <button type="submit" className="rounded border px-2 py-1 text-xs">
                    Save
                  </button>
                </form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {taskTypes.length === 0 && <p className="text-sm text-gray-500">No facility task types seeded yet.</p>}
    </main>
  )
}
