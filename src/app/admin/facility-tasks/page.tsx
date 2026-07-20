import Link from "next/link"
import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getRecurringTasksForMonth, parseMonthParam, monthParamFor, type MonthRecurringTasks } from "@/lib/facilityTasks"
import { createRecurringTaskTemplate, updateRecurringTaskTemplate } from "@/app/facility-tasks/actions"

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
]

async function checkAccess() {
  try {
    await requireRole(["ADMIN"])
    return true
  } catch {
    return false
  }
}

export default async function AdminFacilityTasksCalendarPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const authorized = await checkAccess()

  if (!authorized) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <h1 className="text-xl font-semibold">Not authorized</h1>
        <p className="text-sm text-gray-500">Managing the recurring facility task calendar requires an ADMIN-role account.</p>
      </main>
    )
  }

  const { month: monthParam } = await searchParams
  const monthStart = parseMonthParam(monthParam)
  const prevMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() - 1, 1))
  const nextMonth = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 1))

  const [days, taskTypes, locations, templates] = await Promise.all([
    getRecurringTasksForMonth(monthStart),
    prisma.facilityTaskType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.location.findMany({ where: { isActive: true }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    prisma.recurringTaskTemplate.findMany({
      include: { taskType: true, targetLocation: true },
      orderBy: [{ dayOfWeek: "asc" }, { shiftType: "asc" }]
    })
  ])

  // Pad the first week with blanks so day-of-week columns line up (calendar starts Sunday,
  // matching JS's own getUTCDay() convention already used throughout this codebase).
  const leadingBlanks = days[0]?.dayOfWeek ?? 0
  const cells: (MonthRecurringTasks[number] | null)[] = [...Array.from({ length: leadingBlanks }, () => null), ...days]
  const weeks: (MonthRecurringTasks[number] | null)[][] = []
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7))

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Recurring Facility Task Calendar</h1>
      <p className="text-sm text-gray-500">
        Weekly-recurring slots (trough cleaning, stall cleaning, strip-out cleaning) expanded against real calendar dates for this month —
        nothing here is stored per-date, only the underlying weekday+shift slot (managed below) is. Ad hoc, non-recurring completions are
        logged separately from{" "}
        <Link href="/facility-tasks" className="underline">
          the Facility Tasks quick-add page
        </Link>
        , intentionally outside this calendar.
      </p>

      <div className="flex items-center gap-4 text-sm">
        <Link href={`/admin/facility-tasks?month=${monthParamFor(prevMonth)}`} className="underline">
          ← {MONTH_NAMES[prevMonth.getUTCMonth()]}
        </Link>
        <h2 className="text-sm font-semibold">
          {MONTH_NAMES[monthStart.getUTCMonth()]} {monthStart.getUTCFullYear()}
        </h2>
        <Link href={`/admin/facility-tasks?month=${monthParamFor(nextMonth)}`} className="underline">
          {MONTH_NAMES[nextMonth.getUTCMonth()]} →
        </Link>
      </div>

      <table className="w-full max-w-4xl table-fixed border-collapse text-left text-xs">
        <thead>
          <tr>
            {DAY_NAMES.map((name) => (
              <th key={name} className="border p-1 align-top">
                {name.slice(0, 3)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, weekIndex) => (
            <tr key={weekIndex}>
              {week.map((cell, cellIndex) => (
                <td key={cellIndex} className="h-20 border p-1 align-top">
                  {cell && (
                    <>
                      <div className="font-semibold">{cell.date.getUTCDate()}</div>
                      <ul className="flex flex-col gap-0.5">
                        {cell.templates.map((template) => (
                          <li key={template.id} className="rounded bg-gray-100 px-1">
                            {template.shiftType} {template.taskType.name} — {template.targetLocation.fieldCode ?? template.targetLocation.name}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold">Recurring task slots</h2>
        <p className="text-xs text-gray-500">
          Assign a task type + location to a weekday + shift. Deactivate a slot rather than deleting it — no hard deletes.
        </p>
        <table className="w-full max-w-3xl text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Task</th>
              <th className="py-2">Location</th>
              <th className="py-2">Day</th>
              <th className="py-2">Shift</th>
              <th className="py-2">Active</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => (
              <tr key={template.id} className="border-b align-top">
                <td className="py-2">{template.taskType.name}</td>
                <td className="py-2">{template.targetLocation.fieldCode ?? template.targetLocation.name}</td>
                <td className="py-2">{DAY_NAMES[template.dayOfWeek]}</td>
                <td className="py-2">{template.shiftType}</td>
                <td className="py-2">
                  <form action={updateRecurringTaskTemplate.bind(null, template.id)} className="flex flex-wrap items-center gap-1">
                    <input type="hidden" name="taskTypeId" value={template.taskTypeId} />
                    <input type="hidden" name="targetLocationId" value={template.targetLocationId} />
                    <input type="hidden" name="dayOfWeek" value={template.dayOfWeek} />
                    <input type="hidden" name="shiftType" value={template.shiftType} />
                    <input type="hidden" name="redirectTo" value={`/admin/facility-tasks?month=${monthParamFor(monthStart)}`} />
                    <label className="flex items-center gap-1 text-xs">
                      <input type="checkbox" name="isActive" defaultChecked={template.isActive} />
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
        {templates.length === 0 && <p className="text-sm text-gray-500">No recurring task slots yet.</p>}

        <form action={createRecurringTaskTemplate} className="flex w-full max-w-xs flex-col gap-2 text-sm">
          <h3 className="text-xs font-semibold text-gray-500">Assign a new recurring slot</h3>
          <input type="hidden" name="redirectTo" value={`/admin/facility-tasks?month=${monthParamFor(monthStart)}`} />
          <select name="taskTypeId" required className="rounded border px-2 py-1">
            {taskTypes.map((taskType) => (
              <option key={taskType.id} value={taskType.id}>
                {taskType.name}
              </option>
            ))}
          </select>
          <select name="targetLocationId" required className="rounded border px-2 py-1">
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.fieldCode ?? location.name} ({location.type}
                {location.requiresStripClean ? ", strip" : ""})
              </option>
            ))}
          </select>
          <select name="dayOfWeek" required defaultValue="0" className="rounded border px-2 py-1">
            {DAY_NAMES.map((name, index) => (
              <option key={name} value={index}>
                {name}
              </option>
            ))}
          </select>
          <select name="shiftType" required className="rounded border px-2 py-1">
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
          <button type="submit" className="w-fit rounded bg-black px-4 py-2 text-xs text-white">
            Assign slot
          </button>
        </form>
      </section>
    </main>
  )
}
