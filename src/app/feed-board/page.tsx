import Link from "next/link"
import { requireVolunteer } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createFeedingOverride } from "@/app/animals/[id]/feeding-actions"
import { resolveDisplayedFeedBoardShift, type FeedBoardShift } from "@/lib/feedBoard"
import AutoRefresh from "@/app/AutoRefresh"

async function loadFeedingBaselines(animalIds: string[], shift: FeedBoardShift, today: Date, tomorrow: Date) {
  return prisma.feedingBaseline.findMany({
    where: { animalId: { in: animalIds }, shift },
    include: { feedType: true, overrides: { where: { date: { gte: today, lt: tomorrow } } } },
    orderBy: [{ feedType: { name: "asc" } }]
  })
}

type FeedingBaselineRow = Awaited<ReturnType<typeof loadFeedingBaselines>>[number]

// V3.md Session 6: the real board tracks "Skin Care" as its own daily field, separate from
// Meds — fits the existing CareType/CareEntry model (CONTEXT.md §12), filtered to the
// SEASONAL/GROOMING categories that cover fly masks/topical sprays/leg wraps/blanket changes/
// grooming. Distinct from the "ATTN / Handling Flag" CareType (category MEDICAL, looked up by
// name below) — that one is a short-lived, date-specific health flag that doesn't fit
// Animal.handlingNotes (a single evergreen field), so it renders alongside handlingNotes in
// the Handling Notes column instead of alongside Skin Care.
const SKIN_CARE_CATEGORIES = ["SEASONAL", "GROOMING"] as const
const ATTN_CARE_TYPE_NAME = "ATTN / Handling Flag"

// V2.md Session 6: read-only large-screen display built entirely on data already written by
// Sessions 1-5 (feeding baseline+override, care/medication, location) — no new write models,
// per V2.md's own "reuse existing... don't create parallel ones" instruction. Access follows
// the same "any signed-in volunteer, read-only" precedent already set by dashboard/page.tsx
// and locations/page.tsx (V2.md's "read-only for everyone" is read as "every role", not
// "unauthenticated" — unlike /kiosk, nothing here says "no login required on the shared
// device," so this stays behind requireVolunteer() like every other board/report page).
export default async function FeedBoardPage({ searchParams }: { searchParams: Promise<{ shift?: string }> }) {
  const volunteer = await requireVolunteer()
  const canEdit = volunteer.role === "ADMIN" || volunteer.role === "SHIFT_LEAD"

  // V4.md Session 2: audit finding — the Feed Board previously queried every FeedingBaseline
  // regardless of shift (ordered AM-then-PM, both merged into the same cell), so a horse with
  // both an AM and a PM row for the same feed item showed both lines at once with no way to
  // tell which applied right now. FeedingBaseline.shift already existed and was simply unused
  // for filtering. Fixed here: filter to one shift, defaulting to the automatic noon-boundary
  // switch with a manual ?shift= override any viewer (including KIOSK, a display toggle not a
  // write) can use to check the other shift without waiting.
  const { shift: shiftParam } = await searchParams
  const shift = resolveDisplayedFeedBoardShift(shiftParam, new Date())
  const isManualOverride = shiftParam === "AM" || shiftParam === "PM"

  const animals = await prisma.animal.findMany({ where: { status: "ACTIVE" }, orderBy: { name: "asc" } })
  const animalIds = animals.map((a) => a.id)

  const today = new Date(new Date().toISOString().slice(0, 10))
  const tomorrow = new Date(today)
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1)

  // Standardized headshot: the primary PROFILE photo per animal (falls back to the most
  // recent PROFILE photo if none is marked primary yet). Same DISTINCT ON pattern the
  // dashboard/locations pages already use for "one current row per animal."
  const headshots = await prisma.animalPhoto.findMany({
    where: { animalId: { in: animalIds }, type: "PROFILE" },
    orderBy: [{ animalId: "asc" }, { isPrimary: "desc" }, { createdAt: "desc" }],
    distinct: ["animalId"]
  })
  const headshotByAnimal = new Map(headshots.map((p) => [p.animalId, p]))

  const feedingBaselines = await loadFeedingBaselines(animalIds, shift, today, tomorrow)
  const feedingByAnimal = new Map<string, typeof feedingBaselines>()
  for (const baseline of feedingBaselines) {
    const list = feedingByAnimal.get(baseline.animalId) ?? []
    list.push(baseline)
    feedingByAnimal.set(baseline.animalId, list)
  }

  const medicationRegimens = await prisma.medicationRegimen.findMany({
    where: { animalId: { in: animalIds }, OR: [{ endDate: null }, { endDate: { gte: today } }] },
    orderBy: { drugName: "asc" }
  })
  const medicationByAnimal = new Map<string, typeof medicationRegimens>()
  for (const regimen of medicationRegimens) {
    const list = medicationByAnimal.get(regimen.animalId) ?? []
    list.push(regimen)
    medicationByAnimal.set(regimen.animalId, list)
  }

  // V3.md Session 6: one query for today's CareEntry rows, split in-memory into Skin Care
  // (SEASONAL/GROOMING) vs. the ATTN handling flag (matched by CareType name, looked up once
  // rather than re-querying per animal) — same "one query, filter in JS" pattern already used
  // above for mainFeeds/hayFeeds.
  const todaysCareEntries = await prisma.careEntry.findMany({
    where: { animalId: { in: animalIds }, date: { gte: today, lt: tomorrow } },
    include: { careType: true },
    orderBy: { createdAt: "asc" }
  })
  const skinCareByAnimal = new Map<string, typeof todaysCareEntries>()
  const attnFlagsByAnimal = new Map<string, typeof todaysCareEntries>()
  for (const entry of todaysCareEntries) {
    if (entry.careType.name === ATTN_CARE_TYPE_NAME) {
      const list = attnFlagsByAnimal.get(entry.animalId) ?? []
      list.push(entry)
      attnFlagsByAnimal.set(entry.animalId, list)
    } else if ((SKIN_CARE_CATEGORIES as readonly string[]).includes(entry.careType.category)) {
      const list = skinCareByAnimal.get(entry.animalId) ?? []
      list.push(entry)
      skinCareByAnimal.set(entry.animalId, list)
    }
  }

  // For the "link out to the Turnout Board" affordance — the day location an animal is
  // currently assigned to, derived the same way every other page in this app derives
  // "current" (latest effectiveAt row), not a stored pointer.
  const dayLocationAssignments = await prisma.animalLocationAssignment.findMany({
    where: { animalId: { in: animalIds }, period: "DAY" },
    include: { location: true },
    orderBy: [{ animalId: "asc" }, { effectiveAt: "desc" }],
    distinct: ["animalId"]
  })
  const dayLocationByAnimal = new Map(dayLocationAssignments.map((a) => [a.animalId, a]))

  return (
    <main className="flex flex-1 flex-col gap-4 p-8">
      <div>
        <h1 className="text-xl font-semibold">Feed Board</h1>
        <p className="text-sm text-gray-500">
          One row per active horse — feed, hay, skin care, meds, special instructions, and handling notes at a glance. Read-only here;
          Admin/Shift-Lead can adjust today&apos;s feed/hay amount and special instructions inline on a desktop screen.
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm">
          <div className="flex gap-3">
            <Link href="/feed-board?shift=AM" className={shift === "AM" ? "font-semibold underline" : "underline text-gray-500"}>
              AM
            </Link>
            <Link href="/feed-board?shift=PM" className={shift === "PM" ? "font-semibold underline" : "underline text-gray-500"}>
              PM
            </Link>
            {isManualOverride && (
              <Link href="/feed-board" className="underline text-gray-500">
                Auto
              </Link>
            )}
          </div>
          <Link href={`/turnout-board?period=DAY&feedShift=${shift}`} className="font-medium underline">
            View Turnout Board →
          </Link>
        </div>
      </div>
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b">
            <th className="py-2 pr-4">Horse</th>
            <th className="py-2 pr-4">Feed</th>
            <th className="py-2 pr-4">Hay</th>
            <th className="py-2 pr-4">Skin Care</th>
            <th className="py-2 pr-4">Meds</th>
            <th className="py-2 pr-4">Special instructions</th>
            <th className="py-2">Handling notes</th>
          </tr>
        </thead>
        <tbody>
          {animals.map((animal) => {
            const headshot = headshotByAnimal.get(animal.id)
            const baselines = feedingByAnimal.get(animal.id) ?? []
            const mainFeeds = baselines.filter((b) => b.feedType.category !== "HAY")
            const hayFeeds = baselines.filter((b) => b.feedType.category === "HAY")
            const regimens = medicationByAnimal.get(animal.id) ?? []
            const dayLocation = dayLocationByAnimal.get(animal.id)
            const instructionBaselines = baselines.filter((b) => (b.overrides[0]?.notes ?? b.notes) != null)
            const skinCareEntries = skinCareByAnimal.get(animal.id) ?? []
            const attnFlags = attnFlagsByAnimal.get(animal.id) ?? []

            return (
              <tr key={animal.id} className="border-b align-top">
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-3">
                    {headshot ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={headshot.url} alt={`${animal.name} headshot`} className="h-16 w-16 shrink-0 rounded object-cover" />
                    ) : (
                      <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded bg-gray-100 text-xs text-gray-400">
                        No photo
                      </div>
                    )}
                    <div>
                      <Link href={`/animals/${animal.id}`} className="font-medium underline">
                        {animal.name}
                      </Link>
                      {dayLocation && (
                        <div>
                          <Link
                            href={`/turnout-board?period=DAY&feedShift=${shift}#location-${dayLocation.locationId}`}
                            className="text-xs text-gray-500 underline"
                          >
                            {dayLocation.location.fieldCode ?? dayLocation.location.name}
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-2 pr-4">
                  {mainFeeds.length === 0 ? (
                    <span className="text-gray-500">—</span>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {mainFeeds.map((baseline) => (
                        <FeedCell key={baseline.id} baseline={baseline} animalId={animal.id} canEdit={canEdit} shift={shift} />
                      ))}
                    </ul>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {hayFeeds.length === 0 ? (
                    <span className="text-gray-500">—</span>
                  ) : (
                    <ul className="flex flex-col gap-2">
                      {hayFeeds.map((baseline) => (
                        <FeedCell key={baseline.id} baseline={baseline} animalId={animal.id} canEdit={canEdit} shift={shift} />
                      ))}
                    </ul>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {skinCareEntries.length === 0 ? (
                    <span className="text-gray-500">—</span>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {skinCareEntries.map((entry) => (
                        <li key={entry.id}>
                          {entry.careType.name}
                          {entry.notes ? `: ${entry.notes}` : ""}
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {regimens.length === 0 ? (
                    <span className="text-gray-500">—</span>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {regimens.map((regimen) => (
                        <li key={regimen.id}>
                          {regimen.drugName} <span className="text-gray-500">({regimen.dose})</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="py-2 pr-4">
                  {instructionBaselines.length === 0 ? (
                    <span className="text-gray-500">—</span>
                  ) : (
                    <ul className="flex flex-col gap-0.5">
                      {instructionBaselines.map((baseline) => (
                        <li key={baseline.id}>{baseline.overrides[0]?.notes ?? baseline.notes}</li>
                      ))}
                    </ul>
                  )}
                </td>
                <td className="py-2">
                  {/* Standing guidance (Animal.handlingNotes) plus any short-lived, date-specific
                      ATTN flag logged for today (CareEntry, CareType "ATTN / Handling Flag") —
                      two distinct sources sharing one column since together they're "what to
                      know about handling this horse today," per V3.md Session 6's resolution of
                      the ATTN-flags-don't-fit-handlingNotes gap. */}
                  {!animal.handlingNotes && attnFlags.length === 0 ? (
                    <span className="text-gray-500">—</span>
                  ) : (
                    <div className="flex flex-col gap-0.5">
                      {animal.handlingNotes && <span>{animal.handlingNotes}</span>}
                      {attnFlags.map((entry) => (
                        <span key={entry.id} className="text-red-700">
                          ATTN: {entry.notes}
                        </span>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {animals.length === 0 && <p className="text-sm text-gray-500">No active horses to show.</p>}
      <AutoRefresh />
    </main>
  )
}

// Read-only text always renders; the inline edit form is additionally wrapped in a
// desktop-only breakpoint class (`hidden lg:block`) so it never shows on the TV display or a
// mobile viewport, matching V2.md's "breakpoint/role condition on the same view" instruction —
// this is a CSS-only condition, no client JS, consistent with this codebase's zero-client-
// component convention everywhere except the headshot crop tool.
function FeedCell({
  baseline,
  animalId,
  canEdit,
  shift
}: {
  baseline: FeedingBaselineRow
  animalId: string
  canEdit: boolean
  shift: FeedBoardShift
}) {
  const override = baseline.overrides[0]
  const unit = baseline.feedType.defaultUnit.toLowerCase()
  const createOverrideForBaseline = createFeedingOverride.bind(null, baseline.id, animalId)

  return (
    <li>
      <div>
        <span className="text-gray-500">{baseline.feedType.name}:</span>{" "}
        {override?.amount ? (
          <span className="text-amber-700">
            {override.amount.toString()} {unit}
          </span>
        ) : (
          <span>
            {baseline.amount.toString()} {unit}
          </span>
        )}
      </div>
      {/* Matches the animal detail page's existing convention: once today's override is
          logged, it's shown read-only above (no update path) rather than offering a second
          write on top of it — the form only appears before today's override exists. */}
      {canEdit && !override && (
        <form action={createOverrideForBaseline} className="hidden lg:flex lg:flex-col lg:gap-1 lg:pt-1">
          {/* Preserves the manual shift override across the redirect, same "state intact"
              treatment V4.md Session 2 asks for on the Feed Board <-> Turnout Board round trip. */}
          <input type="hidden" name="redirectTo" value={`/feed-board?shift=${shift}`} />
          <input type="number" step="0.25" name="amount" placeholder={`amount (${unit})`} className="w-32 rounded border px-1 py-0.5 text-xs" />
          <input
            type="text"
            name="notes"
            placeholder="special instructions"
            defaultValue={baseline.notes ?? ""}
            className="w-40 rounded border px-1 py-0.5 text-xs"
          />
          <button type="submit" className="w-fit rounded border px-2 py-0.5 text-xs">
            Log for today
          </button>
        </form>
      )}
    </li>
  )
}
