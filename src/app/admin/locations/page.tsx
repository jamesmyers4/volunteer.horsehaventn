import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createLocation, updateLocation } from "@/app/locations/actions"

async function checkAccess() {
  try {
    await requireRole(["ADMIN"])
    return true
  } catch {
    return false
  }
}

export default async function AdminLocationsPage() {
  const authorized = await checkAccess()

  if (!authorized) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <h1 className="text-xl font-semibold">Not authorized</h1>
        <p className="text-sm text-gray-500">Managing locations requires an ADMIN-role account.</p>
      </main>
    )
  }

  // Unlike the plain /locations list (active-only, read-only for everyone), the Admin Console
  // shows every row including inactive ones — full CRUD (edit/deactivate) was explicitly
  // deferred here from V2.md Session 1 (see HANDOFF.md).
  const locations = await prisma.location.findMany({ orderBy: [{ type: "asc" }, { name: "asc" }] })

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">Locations</h1>
      <p className="text-sm text-gray-500">
        Fields, barn stalls, sick bay, and the covered arena. Type is fixed once a location is created — only name, active status, and
        type-specific fields are editable here.
      </p>

      <table className="w-full max-w-4xl text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Type</th>
            <th className="py-2">Name</th>
            <th className="py-2">Active</th>
            <th className="py-2">Edit</th>
          </tr>
        </thead>
        <tbody>
          {locations.map((location) => (
            <tr key={location.id} className="border-b align-top">
              <td className="py-2">{location.type}</td>
              <td className="py-2">{location.fieldCode ?? location.name}</td>
              <td className="py-2">{location.isActive ? "Yes" : "No"}</td>
              <td className="py-2">
                <form action={updateLocation.bind(null, location.id)} className="flex flex-wrap items-center gap-2">
                  <input type="text" name="name" defaultValue={location.name} required className="w-32 rounded border px-2 py-1 text-xs" />
                  {location.type === "FIELD" && (
                    <>
                      <input
                        type="text"
                        name="fieldCode"
                        defaultValue={location.fieldCode ?? ""}
                        placeholder="field code"
                        className="w-20 rounded border px-2 py-1 text-xs"
                      />
                      <input
                        type="number"
                        name="turnoutOrder"
                        defaultValue={location.turnoutOrder ?? ""}
                        placeholder="turnout order"
                        className="w-24 rounded border px-2 py-1 text-xs"
                      />
                      <input
                        type="number"
                        name="bringInOrder"
                        defaultValue={location.bringInOrder ?? ""}
                        placeholder="bring-in order"
                        className="w-24 rounded border px-2 py-1 text-xs"
                      />
                    </>
                  )}
                  {location.type === "BARN_STALL" && (
                    <>
                      <input
                        type="number"
                        name="barnNumber"
                        defaultValue={location.barnNumber ?? ""}
                        placeholder="barn #"
                        className="w-20 rounded border px-2 py-1 text-xs"
                      />
                      <input
                        type="number"
                        name="stallNumber"
                        defaultValue={location.stallNumber ?? ""}
                        placeholder="stall #"
                        className="w-20 rounded border px-2 py-1 text-xs"
                      />
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" name="requiresStripClean" defaultChecked={location.requiresStripClean} />
                        strip clean
                      </label>
                    </>
                  )}
                  <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" name="isActive" defaultChecked={location.isActive} />
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
      {locations.length === 0 && <p className="text-sm text-gray-500">No locations configured.</p>}

      <form action={createLocation} className="flex w-full max-w-xs flex-col gap-2 text-sm">
        <h2 className="text-xs font-semibold text-gray-500">Add location</h2>
        <input type="hidden" name="redirectTo" value="/admin/locations" />
        <select name="type" required defaultValue="FIELD" className="rounded border px-2 py-1">
          <option value="FIELD">Field</option>
          <option value="BARN_STALL">Barn stall</option>
          <option value="SICK_BAY">Sick bay</option>
          <option value="ARENA">Arena</option>
          <option value="OTHER">Other</option>
        </select>
        <input type="text" name="name" placeholder="name" required className="rounded border px-2 py-1" />
        <input type="text" name="fieldCode" placeholder="field code (FIELD only, e.g. L7)" className="rounded border px-2 py-1" />
        <input type="number" name="barnNumber" placeholder="barn number (BARN_STALL only)" className="rounded border px-2 py-1" />
        <input type="number" name="stallNumber" placeholder="stall number (BARN_STALL only)" className="rounded border px-2 py-1" />
        <button type="submit" className="w-fit rounded bg-black px-4 py-2 text-xs text-white">
          Add location
        </button>
      </form>
    </main>
  )
}
