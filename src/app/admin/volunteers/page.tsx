import Link from "next/link"
import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { updateVolunteerRole, updateCanScheduleEvents } from "./actions"

const ROLE_OPTIONS = ["ADMIN", "SHIFT_LEAD", "VOLUNTEER", "GUEST"] as const

async function checkAccess() {
  try {
    await requireRole(["ADMIN"])
    return true
  } catch {
    return false
  }
}

export default async function AdminVolunteersPage() {
  const authorized = await checkAccess()

  if (!authorized) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <h1 className="text-xl font-semibold">Not authorized</h1>
        <p className="text-sm text-gray-500">Managing volunteer accounts requires an ADMIN-role account.</p>
      </main>
    )
  }

  // Every volunteer, not just ACTIVE ones (unlike /volunteers' directory view) — an Admin
  // managing accounts needs to see inactive records too.
  const volunteers = await prisma.volunteer.findMany({ orderBy: { name: "asc" } })

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">Volunteers — User Management</h1>
      <p className="text-sm text-gray-500">
        Role and event-scheduling permission are set here. Blue release and tag assign/remove reuse the same controls already on each
        volunteer&apos;s own page — follow the link in the last column.
      </p>

      <table className="w-full max-w-4xl text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Name</th>
            <th className="py-2">Role</th>
            <th className="py-2">Can schedule events</th>
            <th className="py-2">Tier</th>
            <th className="py-2">Blue released</th>
            <th className="py-2">Manage</th>
          </tr>
        </thead>
        <tbody>
          {volunteers.map((volunteer) => (
            <tr key={volunteer.id} className="border-b align-top">
              <td className="py-2 font-medium">{volunteer.name}</td>
              <td className="py-2">
                <form action={updateVolunteerRole.bind(null, volunteer.id)} className="flex items-center gap-2">
                  <select name="role" defaultValue={volunteer.role} className="rounded border px-2 py-1 text-xs">
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="rounded border px-2 py-1 text-xs">
                    Save
                  </button>
                </form>
              </td>
              <td className="py-2">
                <form action={updateCanScheduleEvents.bind(null, volunteer.id)} className="flex items-center gap-2">
                  <input type="checkbox" name="canScheduleEvents" defaultChecked={volunteer.canScheduleEvents} />
                  <button type="submit" className="rounded border px-2 py-1 text-xs">
                    Save
                  </button>
                </form>
              </td>
              <td className="py-2">{volunteer.tier}</td>
              <td className="py-2">{volunteer.blueReleasedAt ? "Yes" : "No"}</td>
              <td className="py-2">
                <Link href={`/volunteers/${volunteer.id}`} className="underline">
                  Tier / tags →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {volunteers.length === 0 && <p className="text-sm text-gray-500">No volunteers on file.</p>}
    </main>
  )
}
