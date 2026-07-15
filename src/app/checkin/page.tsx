import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { submitCheckIn } from "./actions"

export default async function CheckInPage({ searchParams }: { searchParams: Promise<{ success?: string }> }) {
  const volunteer = await requireVolunteer()
  const workTypes = await prisma.workType.findMany({ where: { active: true }, orderBy: { name: "asc" } })
  const { success } = await searchParams
  const today = new Date().toISOString().slice(0, 10)

  return (
    <main className="flex flex-1 flex-col items-center gap-4 p-8">
      <h1 className="text-xl font-semibold">Check In — {volunteer.name}</h1>
      {success && <p className="rounded bg-green-100 px-4 py-2 text-sm text-green-800">Shift logged.</p>}
      <form action={submitCheckIn} className="flex w-full max-w-sm flex-col gap-3">
        <label className="flex flex-col gap-1 text-sm">
          Date
          <input type="date" name="date" defaultValue={today} required className="rounded border px-2 py-1" />
        </label>
        <fieldset className="flex flex-col gap-1 text-sm">
          Shift
          <div className="flex gap-4">
            <label className="flex items-center gap-1">
              <input type="radio" name="shiftType" value="AM" defaultChecked required />
              AM
            </label>
            <label className="flex items-center gap-1">
              <input type="radio" name="shiftType" value="PM" required />
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
          <input type="time" name="checkInTime" required className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Time out
          <input type="time" name="checkOutTime" required className="rounded border px-2 py-1" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Notes
          <textarea name="notes" rows={2} className="rounded border px-2 py-1" />
        </label>
        <button type="submit" className="mt-2 rounded bg-black px-4 py-2 text-sm text-white">
          Log shift
        </button>
      </form>
    </main>
  )
}
