import Link from "next/link"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { computeTiers } from "@/lib/tier"

export default async function VolunteersPage() {
  await requireVolunteer()

  const [volunteers, thresholds] = await Promise.all([
    prisma.volunteer.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } }),
    prisma.tierThreshold.findMany()
  ])

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">Volunteers</h1>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Name</th>
            <th className="py-2">Role</th>
            <th className="py-2">Tenure (days)</th>
            <th className="py-2">Tier</th>
          </tr>
        </thead>
        <tbody>
          {volunteers.map((volunteer) => {
            const { tenureDays, actualTier } = computeTiers(volunteer, thresholds)
            return (
              <tr key={volunteer.id} className="border-b">
                <td className="py-2">
                  <Link href={`/volunteers/${volunteer.id}`} className="underline">
                    {volunteer.name}
                  </Link>
                </td>
                <td className="py-2">{volunteer.role}</td>
                <td className="py-2">{volunteer.firstShiftDate ? tenureDays : <span className="text-gray-500">no shifts yet</span>}</td>
                <td className="py-2">{actualTier}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {volunteers.length === 0 && <p className="text-sm text-gray-500">No active volunteers to show.</p>}
    </main>
  )
}
