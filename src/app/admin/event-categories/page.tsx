import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createEventCategory, updateEventCategory } from "./actions"

async function checkAccess() {
  try {
    await requireRole(["ADMIN"])
    return true
  } catch {
    return false
  }
}

export default async function AdminEventCategoriesPage() {
  const authorized = await checkAccess()

  if (!authorized) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <h1 className="text-xl font-semibold">Not authorized</h1>
        <p className="text-sm text-gray-500">Managing event categories requires an ADMIN-role account.</p>
      </main>
    )
  }

  const categories = await prisma.eventCategory.findMany({ orderBy: { name: "asc" } })

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">Event Categories</h1>
      <p className="text-sm text-gray-500">Lookup table backing the category picker on event creation (V2.md Session 4).</p>

      <table className="w-full max-w-xl text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Name</th>
            <th className="py-2">Active</th>
            <th className="py-2">Edit</th>
          </tr>
        </thead>
        <tbody>
          {categories.map((category) => (
            <tr key={category.id} className="border-b align-top">
              <td className="py-2 font-medium">{category.name}</td>
              <td className="py-2">{category.active ? "Yes" : "No"}</td>
              <td className="py-2">
                <form action={updateEventCategory.bind(null, category.id)} className="flex flex-wrap items-center gap-2">
                  <input type="text" name="name" defaultValue={category.name} required className="rounded border px-2 py-1 text-xs" />
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="active" defaultChecked={category.active} />
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
      {categories.length === 0 && <p className="text-sm text-gray-500">No categories configured.</p>}

      <form action={createEventCategory} className="flex w-full max-w-xs flex-col gap-2 text-sm">
        <h2 className="text-xs font-semibold text-gray-500">Add category</h2>
        <input type="text" name="name" placeholder="name" required className="rounded border px-2 py-1" />
        <button type="submit" className="w-fit rounded bg-black px-4 py-2 text-xs text-white">
          Add category
        </button>
      </form>
    </main>
  )
}
