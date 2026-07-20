import Link from "next/link"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  FOSTER: "bg-teal-100 text-teal-800",
  PENDING_ADOPTION: "bg-indigo-100 text-indigo-800",
  ADOPTED: "bg-blue-100 text-blue-800",
  RETURNED: "bg-yellow-100 text-yellow-800",
  DECEASED: "bg-gray-200 text-gray-700",
  TRANSFERRED: "bg-purple-100 text-purple-800"
}

export default async function AnimalsPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireVolunteer()
  const { status } = await searchParams
  const showAll = status === "all"

  const animals = await prisma.animal.findMany({
    where: showAll ? {} : { status: "ACTIVE" },
    orderBy: { name: "asc" }
  })

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Horses</h1>
        <Link href="/animals/new" className="rounded bg-black px-4 py-2 text-sm text-white">
          Add horse
        </Link>
      </div>
      <div className="flex gap-4 text-sm">
        <Link href="/animals" className={!showAll ? "font-semibold underline" : "underline"}>
          Active only
        </Link>
        <Link href="/animals?status=all" className={showAll ? "font-semibold underline" : "underline"}>
          Show all
        </Link>
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2">Name</th>
            <th className="py-2">Status</th>
            <th className="py-2">Sex</th>
            <th className="py-2">Handling</th>
          </tr>
        </thead>
        <tbody>
          {animals.map((animal) => (
            <tr key={animal.id} className="border-b">
              <td className="py-2">
                <Link href={`/animals/${animal.id}`} className="underline">
                  {animal.name}
                </Link>
              </td>
              <td className="py-2">
                <span className={`rounded px-2 py-0.5 text-xs ${statusColors[animal.status]}`}>{animal.status}</span>
              </td>
              <td className="py-2">{animal.sex}</td>
              <td className="py-2">{animal.requiredHandlerColor}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {animals.length === 0 && <p className="text-sm text-gray-500">No horses to show.</p>}
    </main>
  )
}
