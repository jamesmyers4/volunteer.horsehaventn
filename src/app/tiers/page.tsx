import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { updateTierThreshold } from "./actions"

const TIER_ORDER = ["GREEN", "ORANGE", "YELLOW", "BLUE"] as const

export default async function TiersPage() {
  const volunteer = await requireVolunteer()
  const canEdit = volunteer.role === "ADMIN"

  const thresholds = await prisma.tierThreshold.findMany()
  const byTier = new Map(thresholds.map((t) => [t.tier, t]))

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">Tier Thresholds</h1>
      <p className="text-sm text-gray-500">
        Tenure requirements for the Green → Orange → Yellow → Blue handler progression. Approximate pending the real written schedule — see
        CONTEXT.md §16. Blue always requires a manual release regardless of tenure.
      </p>
      <table className="w-full max-w-2xl text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Tier</th>
            <th className="py-2">Min days tenure</th>
            <th className="py-2">Requires manual release</th>
            {canEdit && <th className="py-2">Edit</th>}
          </tr>
        </thead>
        <tbody>
          {TIER_ORDER.map((tier) => {
            const threshold = byTier.get(tier)
            if (!threshold) return null
            return (
              <tr key={tier} className="border-b align-top">
                <td className="py-2 font-medium">{tier}</td>
                <td className="py-2">{threshold.minDaysTenure}</td>
                <td className="py-2">{threshold.requiresManualRelease ? "Yes" : "No"}</td>
                {canEdit && (
                  <td className="py-2">
                    <form action={updateTierThreshold.bind(null, threshold.id)} className="flex items-center gap-2">
                      <input type="number" name="minDaysTenure" defaultValue={threshold.minDaysTenure} className="w-20 rounded border px-2 py-1" />
                      <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" name="requiresManualRelease" defaultChecked={threshold.requiresManualRelease} />
                        manual release
                      </label>
                      <button type="submit" className="rounded border px-2 py-1 text-xs">
                        Save
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
    </main>
  )
}
