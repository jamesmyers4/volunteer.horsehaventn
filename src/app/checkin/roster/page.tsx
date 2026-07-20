import Link from "next/link"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getFarmSettings } from "@/lib/farmSettings"
import { resolveShiftTimesForOccurrence, type ShiftTypeValue } from "@/lib/shifts"
import { getDefaultRoster, canManageShiftRoster } from "@/lib/shiftRoster"
import { assignShiftLead, submitRosterAttendance } from "./actions"

export default async function ShiftRosterPage({
  searchParams
}: {
  searchParams: Promise<{ date?: string; shiftType?: string; success?: string }>
}) {
  const volunteer = await requireVolunteer()
  const { date: dateParam, shiftType: shiftTypeParam, success } = await searchParams

  const dateString = dateParam ?? new Date().toISOString().slice(0, 10)
  const shiftType: ShiftTypeValue = shiftTypeParam === "PM" ? "PM" : "AM"
  const date = new Date(dateString)

  const [{ shift, roster }, farmSettings, template, activeVolunteers] = await Promise.all([
    getDefaultRoster(date, shiftType),
    getFarmSettings(),
    prisma.shiftTemplate.findUnique({ where: { shiftType } }),
    prisma.volunteer.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } })
  ])

  const resolved = template ? resolveShiftTimesForOccurrence(template, shift, farmSettings.activeSeason) : null
  const canManage = canManageShiftRoster(volunteer, shift)
  const canAssignLead = volunteer.role === "ADMIN" || volunteer.role === "SHIFT_LEAD"

  const rosterVolunteerIds = new Set(roster.map((entry) => entry.volunteerId))
  const walkOnCandidates = activeVolunteers.filter((v) => !rosterVolunteerIds.has(v.id))

  return (
    <main className="flex flex-1 flex-col items-center gap-8 p-8">
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <h1 className="text-xl font-semibold">
          Shift Roster — {dateString} {shiftType}
        </h1>
        <p className="text-xs text-gray-500">
          Jump to{" "}
          <Link href={`/checkin/roster?date=${dateString}&shiftType=AM`} className="underline">
            AM
          </Link>{" "}
          or{" "}
          <Link href={`/checkin/roster?date=${dateString}&shiftType=PM`} className="underline">
            PM
          </Link>
          . Back to <Link href="/checkin" className="underline">Check In</Link>.
        </p>
        {success && <p className="rounded bg-green-100 px-4 py-2 text-sm text-green-800">Attendance recorded.</p>}

        <section className="flex flex-col gap-2 rounded border p-3">
          <h2 className="text-sm font-semibold">Shift lead for this occurrence</h2>
          <p className="text-xs text-gray-500">
            {shift?.assignedLead ? `Currently: ${shift.assignedLead.name}` : "No occurrence-scoped lead assigned — global Admin/Shift Lead can still manage this roster."}
          </p>
          {canAssignLead && (
            <form action={assignShiftLead.bind(null, dateString, shiftType)} className="flex items-center gap-2">
              <select name="assignedLeadId" defaultValue={shift?.assignedLeadId ?? ""} className="rounded border px-2 py-1 text-sm">
                <option value="">— none —</option>
                {activeVolunteers.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <button type="submit" className="rounded border px-3 py-1 text-xs">
                Set lead
              </button>
            </form>
          )}
        </section>

        {canManage ? (
          <form action={submitRosterAttendance.bind(null, dateString, shiftType)} className="flex flex-col gap-4 rounded border p-3">
            <div className="flex items-center gap-2 text-sm">
              <label className="flex flex-col gap-1">
                Time in
                <input
                  type="time"
                  name="checkInTime"
                  defaultValue={resolved?.start}
                  className="rounded border px-2 py-1"
                />
              </label>
              <label className="flex flex-col gap-1">
                Time out
                <input
                  type="time"
                  name="checkOutTime"
                  defaultValue={resolved?.end}
                  className="rounded border px-2 py-1"
                />
              </label>
            </div>

            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Present</th>
                  <th className="py-2">Volunteer</th>
                  <th className="py-2">Source</th>
                  <th className="py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((entry) => (
                  <tr key={entry.volunteerId} className="border-b">
                    <td className="py-2">
                      {entry.checkIn ? (
                        <span className="text-xs text-gray-400">n/a</span>
                      ) : (
                        <input type="checkbox" name="presentVolunteerIds" value={entry.volunteerId} defaultChecked />
                      )}
                    </td>
                    <td className="py-2">{entry.volunteer.name}</td>
                    <td className="py-2 text-xs text-gray-500">
                      {entry.fromRegularAssignment ? "Regular assignment" : "Walk-on / self check-in"}
                    </td>
                    <td className="py-2 text-xs">
                      {entry.checkIn ? `Already checked in (${entry.checkIn.checkInMethod})` : "Will be logged as ADMIN_ENTRY"}
                    </td>
                  </tr>
                ))}
                {roster.length === 0 && (
                  <tr>
                    <td colSpan={4} className="py-2 text-xs text-gray-500">
                      No default roster for this date/shift yet — add a walk-on below.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <label className="flex flex-col gap-1 text-sm">
              Add a walk-on / fill-in
              <select name="presentVolunteerIds" multiple size={5} className="rounded border px-2 py-1">
                {walkOnCandidates.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-gray-500">Ctrl/Cmd-click to select more than one — anyone selected here counts as present too.</span>
            </label>

            <button type="submit" className="rounded bg-black px-4 py-2 text-sm text-white">
              Submit attendance
            </button>
          </form>
        ) : (
          <p className="text-xs text-gray-500">
            You&apos;re not the assigned lead for this shift and don&apos;t hold a global Admin/Shift Lead role, so the roster below is read-only.
          </p>
        )}

        {!canManage && (
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2">Volunteer</th>
                <th className="py-2">Source</th>
                <th className="py-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {roster.map((entry) => (
                <tr key={entry.volunteerId} className="border-b">
                  <td className="py-2">{entry.volunteer.name}</td>
                  <td className="py-2 text-xs text-gray-500">{entry.fromRegularAssignment ? "Regular assignment" : "Walk-on / self check-in"}</td>
                  <td className="py-2 text-xs">{entry.checkIn ? `Checked in (${entry.checkIn.checkInMethod})` : "Not yet checked in"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  )
}
