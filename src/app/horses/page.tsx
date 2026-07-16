import Link from "next/link"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  ADOPTED: "bg-blue-100 text-blue-800",
  RETURNED: "bg-yellow-100 text-yellow-800",
  DECEASED: "bg-gray-200 text-gray-700",
  TRANSFERRED: "bg-purple-100 text-purple-800"
}

export default async function HorsesPage({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireVolunteer()
  const { status } = await searchParams
  const showAll = status === "all"

  const horses = await prisma.horse.findMany({
    where: showAll ? {} : { status: "ACTIVE" },
    orderBy: { name: "asc" }
  })

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Horses</h1>
        <Link href="/horses/new" className="rounded bg-black px-4 py-2 text-sm text-white">
          Add horse
        </Link>
      </div>
      <div className="flex gap-4 text-sm">
        <Link href="/horses" className={!showAll ? "font-semibold underline" : "underline"}>
          Active only
        </Link>
        <Link href="/horses?status=all" className={showAll ? "font-semibold underline" : "underline"}>
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
          {horses.map((horse) => (
            <tr key={horse.id} className="border-b">
              <td className="py-2">
                <Link href={`/horses/${horse.id}`} className="underline">
                  {horse.name}
                </Link>
              </td>
              <td className="py-2">
                <span className={`rounded px-2 py-0.5 text-xs ${statusColors[horse.status]}`}>{horse.status}</span>
              </td>
              <td className="py-2">{horse.sex}</td>
              <td className="py-2">{horse.requiredHandlerColor}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {horses.length === 0 && <p className="text-sm text-gray-500">No horses to show.</p>}
    </main>
  )
}
