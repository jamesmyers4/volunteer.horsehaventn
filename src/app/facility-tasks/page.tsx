import Link from "next/link"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getExpectedFacilityTasks, startOfDay, type ShiftTypeValue } from "@/lib/facilityTasks"
import { createRecurringTaskTemplate, updateRecurringTaskTemplate, logFacilityTaskCompletion } from "./actions"

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

export default async function FacilityTasksPage({ searchParams }: { searchParams: Promise<{ shiftType?: string }> }) {
  const volunteer = await requireVolunteer()
  const canManageTemplates = volunteer.role === "ADMIN" || volunteer.role === "SHIFT_LEAD"
  const { shiftType: shiftTypeParam } = await searchParams
  const selectedShiftType: ShiftTypeValue = shiftTypeParam === "PM" ? "PM" : "AM"
  const todayString = new Date().toISOString().slice(0, 10)
  const today = startOfDay(new Date())

  const [expectedTasks, taskTypes, locations, templates] = await Promise.all([
    getExpectedFacilityTasks(today, selectedShiftType),
    prisma.facilityTaskType.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    prisma.location.findMany({ where: { isActive: true }, orderBy: [{ type: "asc" }, { name: "asc" }] }),
    canManageTemplates
      ? prisma.recurringTaskTemplate.findMany({
          include: { taskType: true, targetLocation: true },
          orderBy: [{ dayOfWeek: "asc" }, { shiftType: "asc" }]
        })
      : Promise.resolve([])
  ])

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">Facility Tasks</h1>
      <p className="text-sm text-gray-500">
        Trough cleaning, stall cleaning, and strip-out cleaning on their weekly recurring rotation. The list below is derived from the
        recurring schedule, not stored — a completion is only recorded once someone actually checks it off.
      </p>

      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-semibold">
            Today ({todayString}) — {selectedShiftType}
          </h2>
          <p className="text-xs text-gray-500">
            <Link href="/facility-tasks?shiftType=AM" className="underline">
              AM
            </Link>{" "}
            /{" "}
            <Link href="/facility-tasks?shiftType=PM" className="underline">
              PM
            </Link>
          </p>
        </div>
        <table className="w-full max-w-2xl text-left text-sm">
          <thead>
            <tr className="border-b">
              <th className="py-2">Task</th>
              <th className="py-2">Location</th>
              <th className="py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {expectedTasks.map(({ template, completed }) => (
              <tr key={template.id} className="border-b align-top">
                <td className="py-2">{template.taskType.name}</td>
                <td className="py-2">{template.targetLocation.fieldCode ?? template.targetLocation.name}</td>
                <td className="py-2">
                  {completed ? (
                    <span className="text-green-700">Done</span>
                  ) : (
                    <form action={logFacilityTaskCompletion} className="flex items-center gap-2">
                      <input type="hidden" name="templateId" value={template.id} />
                      <input type="hidden" name="date" value={todayString} />
                      <button type="submit" className="rounded border px-2 py-1 text-xs">
                        Mark complete
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {expectedTasks.length === 0 && <p className="text-sm text-gray-500">No recurring tasks scheduled for this day/shift.</p>}
      </section>

      <section className="flex w-full max-w-sm flex-col gap-2">
        <h2 className="text-sm font-semibold">Quick add (ad hoc)</h2>
        <p className="text-xs text-gray-500">For anything done outside the recurring pattern above.</p>
        <form action={logFacilityTaskCompletion} className="flex flex-col gap-2 text-sm">
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
          <input type="date" name="date" defaultValue={todayString} required className="rounded border px-2 py-1" />
          <select name="shiftType" required defaultValue={selectedShiftType} className="rounded border px-2 py-1">
            <option value="AM">AM</option>
            <option value="PM">PM</option>
          </select>
          <input type="text" name="notes" placeholder="notes" className="rounded border px-2 py-1" />
          <button type="submit" className="w-fit rounded bg-black px-4 py-2 text-xs text-white">
            Log completion
          </button>
        </form>
      </section>

      {canManageTemplates && (
        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-semibold">Recurring task templates</h2>
          <p className="text-xs text-gray-500">
            Plain list — the full monthly calendar view is a later admin-console addition. Deactivate a row rather than deleting it.
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
          {templates.length === 0 && <p className="text-sm text-gray-500">No recurring task templates yet.</p>}

          <form action={createRecurringTaskTemplate} className="flex w-full max-w-xs flex-col gap-2 text-sm">
            <h3 className="text-xs font-semibold text-gray-500">Add recurring template</h3>
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
              Add template
            </button>
          </form>
        </section>
      )}
    </main>
  )
}
