import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getFarmSettings } from "@/lib/farmSettings"
import { updateFarmSettings, updateShiftTemplate } from "./actions"

const SHIFT_TYPE_ORDER = ["AM", "PM"] as const

export default async function SettingsPage() {
  const volunteer = await requireVolunteer()
  const canEdit = volunteer.role === "ADMIN"

  const [farmSettings, templates] = await Promise.all([getFarmSettings(), prisma.shiftTemplate.findMany()])
  const byShiftType = new Map(templates.map((t) => [t.shiftType, t]))

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Farm Settings</h1>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Active season</h2>
        <p className="text-sm text-gray-500">
          A manual switch flipped by farm staff based on daylight/weather — not date-driven automation. Controls which column of shift
          times below is currently in effect.
        </p>
        <p className="text-sm">
          Currently: <span className="font-semibold">{farmSettings.activeSeason}</span>
        </p>
        {canEdit && (
          <form action={updateFarmSettings} className="flex items-center gap-2">
            <select name="activeSeason" defaultValue={farmSettings.activeSeason} className="rounded border px-2 py-1 text-sm">
              <option value="STANDARD">Standard</option>
              <option value="WINTER">Winter</option>
            </select>
            <button type="submit" className="rounded border px-2 py-1 text-xs">
              Save
            </button>
          </form>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Shift templates</h2>
        <p className="text-sm text-gray-500">
          Reference times only — logging hours pre-fills from these but stays editable, not an enforced punch clock. A Shift Lead or
          Admin can further correct a specific day&apos;s actual time from the Check In page.
        </p>
        <table className="w-full max-w-2xl text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Shift</th>
              <th className="py-2">Standard start</th>
              <th className="py-2">Standard end</th>
              <th className="py-2">Winter start</th>
              <th className="py-2">Winter end</th>
              {canEdit && <th className="py-2">Edit</th>}
            </tr>
          </thead>
          <tbody>
            {SHIFT_TYPE_ORDER.map((shiftType) => {
              const template = byShiftType.get(shiftType)
              if (!template) return null
              return (
                <tr key={shiftType} className="border-b align-top">
                  <td className="py-2 font-medium">{template.name}</td>
                  <td className="py-2">{template.standardStartTime}</td>
                  <td className="py-2">{template.standardEndTime}</td>
                  <td className="py-2">{template.winterStartTime ?? "—"}</td>
                  <td className="py-2">{template.winterEndTime ?? "—"}</td>
                  {canEdit && (
                    <td className="py-2">
                      <form action={updateShiftTemplate.bind(null, template.id)} className="flex flex-wrap items-center gap-1">
                        <input
                          type="time"
                          name="standardStartTime"
                          defaultValue={template.standardStartTime}
                          required
                          className="w-24 rounded border px-1 py-1"
                        />
                        <input
                          type="time"
                          name="standardEndTime"
                          defaultValue={template.standardEndTime}
                          required
                          className="w-24 rounded border px-1 py-1"
                        />
                        <input
                          type="time"
                          name="winterStartTime"
                          defaultValue={template.winterStartTime ?? ""}
                          className="w-24 rounded border px-1 py-1"
                        />
                        <input
                          type="time"
                          name="winterEndTime"
                          defaultValue={template.winterEndTime ?? ""}
                          className="w-24 rounded border px-1 py-1"
                        />
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
      </section>
    </main>
  )
}
