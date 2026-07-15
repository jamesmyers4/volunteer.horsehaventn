import { requireRole } from "@/lib/auth"

async function getAuthorizedVolunteer() {
  try {
    return await requireRole(["ADMIN"])
  } catch {
    return null
  }
}

export default async function AdminCheckPage() {
  const volunteer = await getAuthorizedVolunteer()

  if (!volunteer) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
        <h1 className="text-xl font-semibold">Not authorized</h1>
        <p className="text-sm text-gray-500">This page requires an ADMIN-role Volunteer record linked to your account.</p>
      </main>
    )
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="text-xl font-semibold">Admin access confirmed</h1>
      <p className="text-sm text-gray-500">
        {volunteer.name} · {volunteer.role} · tier {volunteer.tier}
      </p>
    </main>
  )
}
