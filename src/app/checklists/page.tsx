import { requireRole } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import {
  createChecklistTemplate,
  updateChecklistTemplate,
  createChecklistTemplateItem,
  updateChecklistTemplateItem
} from "./actions"

const RESPONSE_TYPES = ["TEXT", "BOOLEAN", "NUMBER"] as const

async function checkAccess() {
  try {
    await requireRole(["ADMIN"])
    return true
  } catch {
    return false
  }
}

export default async function ChecklistsPage() {
  const authorized = await checkAccess()

  if (!authorized) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <h1 className="text-xl font-semibold">Not authorized</h1>
        <p className="text-sm text-gray-500">Managing checklist templates requires an ADMIN-role Volunteer record.</p>
      </main>
    )
  }

  const templates = await prisma.checklistTemplate.findMany({
    include: { items: { orderBy: { order: "asc" } } },
    orderBy: { createdAt: "asc" }
  })

  return (
    <main className="flex flex-1 flex-col gap-6 p-8">
      <h1 className="text-xl font-semibold">End-of-Shift Checklist Templates</h1>
      <p className="text-sm text-gray-500">
        Generic engine only — the real ~5-6 page end-of-shift form content isn&apos;t available yet, so this ships with one placeholder
        question. Add the real questions here once the content exists.
      </p>

      {templates.map((template) => (
        <section key={template.id} className="flex flex-col gap-3 rounded border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold">
              {template.name} {template.isActive ? "" : "(inactive)"}
            </h2>
          </div>
          <form action={updateChecklistTemplate.bind(null, template.id)} className="flex flex-wrap items-center gap-2 text-sm">
            <input type="text" name="name" defaultValue={template.name} className="rounded border px-2 py-1 text-xs" />
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" name="isActive" defaultChecked={template.isActive} />
              active
            </label>
            <button type="submit" className="rounded border px-2 py-1 text-xs">
              Save
            </button>
          </form>

          <table className="w-full max-w-2xl text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2">Order</th>
                <th className="py-2">Prompt</th>
                <th className="py-2">Type</th>
                <th className="py-2">Edit</th>
              </tr>
            </thead>
            <tbody>
              {template.items.map((item) => (
                <tr key={item.id} className="border-b align-top">
                  <td className="py-2">{item.order}</td>
                  <td className="py-2 font-medium">{item.prompt}</td>
                  <td className="py-2">{item.responseType}</td>
                  <td className="py-2">
                    <form action={updateChecklistTemplateItem.bind(null, item.id)} className="flex flex-wrap items-center gap-1">
                      <input type="number" name="order" defaultValue={item.order} className="w-14 rounded border px-2 py-1 text-xs" />
                      <input type="text" name="prompt" defaultValue={item.prompt} className="rounded border px-2 py-1 text-xs" />
                      <select name="responseType" defaultValue={item.responseType} className="rounded border px-2 py-1 text-xs">
                        {RESPONSE_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="rounded border px-2 py-1 text-xs">
                        Save
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
              {template.items.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-2 text-xs text-gray-500">
                    No items yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <form action={createChecklistTemplateItem.bind(null, template.id)} className="flex flex-wrap items-center gap-2 text-sm">
            <input type="number" name="order" defaultValue={template.items.length} className="w-14 rounded border px-2 py-1" required />
            <input type="text" name="prompt" placeholder="prompt" required className="rounded border px-2 py-1" />
            <select name="responseType" defaultValue="TEXT" className="rounded border px-2 py-1">
              {RESPONSE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
            <button type="submit" className="rounded bg-black px-4 py-2 text-xs text-white">
              Add item
            </button>
          </form>
        </section>
      ))}

      <section className="flex w-full max-w-sm flex-col gap-2">
        <h2 className="text-sm font-semibold">Add template</h2>
        <form action={createChecklistTemplate} className="flex flex-col gap-2 text-sm">
          <input type="text" name="name" placeholder="template name" required className="rounded border px-2 py-1" />
          <button type="submit" className="w-fit rounded bg-black px-4 py-2 text-xs text-white">
            Add template
          </button>
        </form>
      </section>
    </main>
  )
}
