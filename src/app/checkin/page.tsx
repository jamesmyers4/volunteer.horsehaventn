import Link from "next/link"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getFarmSettings } from "@/lib/farmSettings"
import { resolveShiftTimesForOccurrence, type ShiftTypeValue } from "@/lib/shifts"
import { submitCheckIn, setShiftActualTimes, updateOwnCheckIn } from "./actions"

const SHIFT_TYPES: ShiftTypeValue[] = ["AM", "PM"]

export default async function CheckInPage({
  searchParams
}: {
  searchParams: Promise<{ success?: string; shiftType?: string }>
}) {
  const volunteer = await requireVolunteer()
  const canOverrideShiftTimes = volunteer.role === "ADMIN" || volunteer.role === "SHIFT_LEAD"
  const workTypes = await prisma.workType.findMany({ where: { active: true }, orderBy: { name: "asc" } })
  const { success, shiftType: shiftTypeParam } = await searchParams
  const selectedShiftType: ShiftTypeValue = shiftTypeParam === "PM" ? "PM" : "AM"
  // todayString matches the existing convention this page already used for the date input's
  // default (UTC-based). todayStart is parsed from that exact same string, not built
  // separately from local Date components, so it matches both the DB value written by
  // setShiftActualTimes below (also `new Date(dateString)`) and submitCheckIn's own
  // `new Date(date)` — one date representation used consistently everywhere on this page.
  const todayString = new Date().toISOString().slice(0, 10)
  const todayStart = new Date(todayString)

  const [farmSettings, templates, todaysShifts, myRecentCheckIns] = await Promise.all([
    getFarmSettings(),
    prisma.shiftTemplate.findMany(),
    prisma.shift.findMany({ where: { date: todayStart } }),
    prisma.checkIn.findMany({
      where: { volunteerId: volunteer.id },
      include: { shift: true, workType: true },
      orderBy: { checkInAt: "desc" },
      take: 5
    })
  ])
  const templateByType = new Map(templates.map((t) => [t.shiftType, t]))
  const shiftByType = new Map(todaysShifts.map((s) => [s.type, s]))

  const resolvedByType = new Map(
    SHIFT_TYPES.map((type) => {
      const template = templateByType.get(type)
      if (!template) return [type, null] as const
      return [type, resolveShiftTimesForOccurrence(template, shiftByType.get(type) ?? null, farmSettings.activeSeason)] as const
    })
  )
  const selectedResolved = resolvedByType.get(selectedShiftType)

  return (
    <main className="flex flex-1 flex-col items-center gap-8 p-8">
      <div className="flex w-full max-w-sm flex-col items-center gap-4">
        <h1 className="text-xl font-semibold">Check In — {volunteer.name}</h1>
        <div className="flex gap-3">
          <Link href="/checkin/code" className="text-xs underline">
            My check-in code / QR
          </Link>
          <Link href="/checkin/roster" className="text-xs underline">
            Shift roster
          </Link>
        </div>
        {success && <p className="rounded bg-green-100 px-4 py-2 text-sm text-green-800">Shift logged.</p>}

        <p className="text-xs text-gray-500">
          Jump to{" "}
          <Link href="/checkin?shiftType=AM" className="underline">
            AM
          </Link>{" "}
          or{" "}
          <Link href="/checkin?shiftType=PM" className="underline">
            PM
          </Link>{" "}
          to pre-fill the times below from that shift&apos;s reference time — the radio buttons below are still what actually gets
          submitted.
        </p>

        <form action={submitCheckIn} className="flex w-full flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            Date
            <input type="date" name="date" defaultValue={todayString} required className="rounded border px-2 py-1" />
          </label>
          <fieldset className="flex flex-col gap-1 text-sm">
            Shift
            <div className="flex gap-4">
              <label className="flex items-center gap-1">
                <input type="radio" name="shiftType" value="AM" defaultChecked={selectedShiftType === "AM"} required />
                AM
              </label>
              <label className="flex items-center gap-1">
                <input type="radio" name="shiftType" value="PM" defaultChecked={selectedShiftType === "PM"} required />
                PM
              </label>
            </div>
          </fieldset>
          <label className="flex flex-col gap-1 text-sm">
            Type of work
            <select name="workTypeId" required className="rounded border px-2 py-1">
              {workTypes.map((workType) => (
                <option key={workType.id} value={workType.id}>
                  {workType.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Time in
            <input
              type="time"
              name="checkInTime"
              defaultValue={selectedResolved?.start}
              required
              className="rounded border px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Time out
            <input
              type="time"
              name="checkOutTime"
              defaultValue={selectedResolved?.end}
              required
              className="rounded border px-2 py-1"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Notes
            <textarea name="notes" rows={2} className="rounded border px-2 py-1" />
          </label>
          <button type="submit" className="mt-2 rounded bg-black px-4 py-2 text-sm text-white">
            Log shift
          </button>
        </form>
      </div>

      <section className="flex w-full max-w-sm flex-col gap-2">
        <h2 className="text-sm font-semibold">Today&apos;s shift times</h2>
        <p className="text-xs text-gray-500">
          Reference only — season is currently <span className="font-semibold">{farmSettings.activeSeason}</span> (see{" "}
          <Link href="/settings" className="underline">
            Settings
          </Link>
          ).
        </p>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Shift</th>
              <th className="py-2">Resolved time</th>
              {canOverrideShiftTimes && <th className="py-2">Override today</th>}
            </tr>
          </thead>
          <tbody>
            {SHIFT_TYPES.map((type) => {
              const resolved = resolvedByType.get(type)
              const shift = shiftByType.get(type)
              return (
                <tr key={type} className="border-b align-top">
                  <td className="py-2 font-medium">{type}</td>
                  <td className="py-2">{resolved ? `${resolved.start} – ${resolved.end}` : "—"}</td>
                  {canOverrideShiftTimes && (
                    <td className="py-2">
                      <form action={setShiftActualTimes.bind(null, todayString, type)} className="flex items-center gap-1">
                        <input
                          type="time"
                          name="actualStartTime"
                          defaultValue={shift?.actualStartTime ?? undefined}
                          required
                          className="w-24 rounded border px-1 py-1"
                        />
                        <input
                          type="time"
                          name="actualEndTime"
                          defaultValue={shift?.actualEndTime ?? undefined}
                          required
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

      <section className="flex w-full max-w-sm flex-col gap-2">
        <h2 className="text-sm font-semibold">Your recent check-ins</h2>
        <p className="text-xs text-gray-500">
          Correct a time here if it&apos;s wrong — this also covers a bulk roster entry a shift lead logged on your behalf (
          <span className="font-mono">ADMIN_ENTRY</span>).
        </p>
        {myRecentCheckIns.length === 0 && <p className="text-xs text-gray-500">No check-ins yet.</p>}
        <table className="w-full text-left text-sm">
          <tbody>
            {myRecentCheckIns.map((checkIn) => {
              const dateString = checkIn.checkInAt.toISOString().slice(0, 10)
              const timeIn = checkIn.checkInAt.toISOString().slice(11, 16)
              const timeOut = checkIn.checkOutAt ? checkIn.checkOutAt.toISOString().slice(11, 16) : ""
              return (
                <tr key={checkIn.id} className="border-b align-top">
                  <td className="py-2 pr-2 align-middle text-xs">
                    {dateString} {checkIn.shift.type}
                    <br />
                    <span className="text-gray-500">{checkIn.checkInMethod}</span>
                  </td>
                  <td className="py-2">
                    <form action={updateOwnCheckIn.bind(null, checkIn.id)} className="flex flex-wrap items-center gap-1">
                      <input type="time" name="checkInTime" defaultValue={timeIn} required className="w-24 rounded border px-1 py-1" />
                      <input type="time" name="checkOutTime" defaultValue={timeOut} required className="w-24 rounded border px-1 py-1" />
                      <input
                        type="text"
                        name="notes"
                        defaultValue={checkIn.notes ?? ""}
                        placeholder="Notes"
                        className="w-28 rounded border px-1 py-1"
                      />
                      <button type="submit" className="rounded border px-2 py-1 text-xs">
                        Save
                      </button>
                    </form>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
    </main>
  )
}
