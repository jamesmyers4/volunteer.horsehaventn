import Link from "next/link"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { canSubmitShiftReport } from "@/lib/shiftReport"
import type { ShiftTypeValue } from "@/lib/shifts"
import { submitShiftReport } from "./actions"

export default async function ShiftReportPage({
  searchParams
}: {
  searchParams: Promise<{ date?: string; shiftType?: string; success?: string }>
}) {
  const volunteer = await requireVolunteer()
  const { date: dateParam, shiftType: shiftTypeParam, success } = await searchParams

  const dateString = dateParam ?? new Date().toISOString().slice(0, 10)
  const shiftType: ShiftTypeValue = shiftTypeParam === "PM" ? "PM" : "AM"
  const date = new Date(dateString)

  const [shift, template] = await Promise.all([
    prisma.shift.findUnique({
      where: { date_type: { date, type: shiftType } },
      include: { report: { include: { responses: { include: { templateItem: true } }, submittedBy: true } } }
    }),
    prisma.checklistTemplate.findFirst({ where: { isActive: true }, orderBy: { createdAt: "asc" }, include: { items: { orderBy: { order: "asc" } } } })
  ])

  const canSubmit = canSubmitShiftReport(volunteer, shift)

  return (
    <main className="flex flex-1 flex-col items-center gap-8 p-8">
      <div className="flex w-full max-w-2xl flex-col gap-4">
        <h1 className="text-xl font-semibold">
          End-of-Shift Report — {dateString} {shiftType}
        </h1>
        <p className="text-xs text-gray-500">
          Jump to{" "}
          <Link href={`/checkin/shift-report?date=${dateString}&shiftType=AM`} className="underline">
            AM
          </Link>{" "}
          or{" "}
          <Link href={`/checkin/shift-report?date=${dateString}&shiftType=PM`} className="underline">
            PM
          </Link>
          . Back to <Link href={`/checkin/roster?date=${dateString}&shiftType=${shiftType}`} className="underline">Shift Roster</Link>.
        </p>
        {success && <p className="rounded bg-green-100 px-4 py-2 text-sm text-green-800">Report submitted.</p>}

        {shift?.report ? (
          <section className="flex flex-col gap-2 rounded border p-4 text-sm">
            <p className="text-xs text-gray-500">
              Submitted by {shift.report.submittedBy.name} at {shift.report.submittedAt.toLocaleString()}.
            </p>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="py-2">Prompt</th>
                  <th className="py-2">Response</th>
                </tr>
              </thead>
              <tbody>
                {shift.report.responses.map((response) => (
                  <tr key={response.id} className="border-b">
                    <td className="py-2">{response.templateItem.prompt}</td>
                    <td className="py-2">{response.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ) : canSubmit ? (
          template ? (
            <form action={submitShiftReport.bind(null, dateString, shiftType)} className="flex flex-col gap-4 rounded border p-4 text-sm">
              <input type="hidden" name="templateId" value={template.id} />
              {template.items.map((item) => (
                <label key={item.id} className="flex flex-col gap-1">
                  {item.prompt}
                  {item.responseType === "BOOLEAN" && <input type="checkbox" name={`item_${item.id}`} />}
                  {item.responseType === "NUMBER" && <input type="number" name={`item_${item.id}`} className="rounded border px-2 py-1" />}
                  {item.responseType === "TEXT" && <textarea name={`item_${item.id}`} className="rounded border px-2 py-1" />}
                </label>
              ))}
              <button type="submit" className="w-fit rounded bg-black px-4 py-2 text-sm text-white">
                Submit report
              </button>
            </form>
          ) : (
            <p className="text-sm text-gray-500">No active checklist template configured.</p>
          )
        ) : (
          <p className="text-xs text-gray-500">
            Only this shift&apos;s assigned lead or an Admin can submit the end-of-shift report.
          </p>
        )}
      </div>
    </main>
  )
}
