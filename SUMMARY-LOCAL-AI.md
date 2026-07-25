# Task List for Local AI Agent (Qwen2.5-Coder)

## Read this whole section before doing anything

You are working in an existing Next.js 16 + Prisma 7 + TypeScript codebase called `volunteer.horsehaventn`. This document contains **16 numbered tasks**. Each task is a small, independent, mechanical code change.

**Rules you must follow:**

1. **Do exactly one task at a time.** Finish it, run its success check, and stop. Do not start the next task in the same edit. Do not combine two tasks into one change.
2. **Only touch the file(s) named in that task.** Do not "improve," reformat, rename variables, add comments, or refactor anything else you notice in a file while you're in there for a different reason. If you see something else that looks wrong, leave it alone — it is not part of your task.
3. **Do not touch any file under `src/app/**/*.tsx` for styling/layout/wording.** Some tasks edit `.tsx` files, but only the specific data-fetching `prisma.*.findMany(...)` call shown in that task — never the JSX/markup below it in the same file.
4. **Match the existing code snippets exactly** before making your edit — the "Current code" block in each task is copied verbatim from the real file. If what you find in the file does not match the "Current code" block shown (even by one character), STOP and do not guess — that means either a task before this one wasn't applied correctly, or the file has changed. Do not try to improvise a fix.
5. **Never delete a test file, never edit anything under `tests/`, never edit `prisma/schema.prisma`, never run `prisma migrate`.** None of these 16 tasks require it.
6. **Do the tasks in order.** Tasks 2–7 depend on Task 1 already being done (they call a helper function Task 1 creates). Tasks 8 and 9 depend on Tasks 6 and 7 respectively already being done (same functions, later edit). All other tasks are independent of each other and can be done in any order, but do them in numeric order anyway to keep things simple.
7. After each task, use the **"Success check"** at the end of that task to confirm you did it right before moving on. If the success check fails, re-read the task and fix your edit — do not move to the next task with a failing check.

If you cannot run a command listed in a success check (for example, no database is available in your environment), at minimum run the `grep` commands given — they don't need a database and will still tell you whether the edit is textually correct.

---

## Task 1 — Add a `findOrCreateShift` helper to `src/lib/checkin.ts`

**Why:** `Shift` is supposed to have every write tracked in the `ChangeLog` table (see `src/lib/prisma.ts`'s `trackedModels` array, which includes `"Shift"`). But every place in the code that creates a `Shift` row uses `prisma.shift.upsert(...)` directly, and Prisma's `withChangeLog` extension only watches the `create` and `update` operations — `upsert` is a different operation and is never seen by the extension. So new `Shift` rows are created with **no ChangeLog entry at all**. This task adds one small helper function that does the same job (find the row if it exists, create it through ChangeLog if it doesn't) but goes through `withChangeLog` correctly. Tasks 2–7 will then replace each of the 6 places that currently call `prisma.shift.upsert(...)` directly with a call to this new helper.

**File to edit:** `src/lib/checkin.ts`

**Current code** (this is the top of the file, unchanged — you are only adding new code, not replacing this part):

```ts
import { prisma, withChangeLog } from "./prisma"
import { getFarmSettings } from "./farmSettings"
import { determineShiftTypeForNow } from "./shifts"

const DEFAULT_KIOSK_WORK_TYPE = "Regular Shift"

/**
 * V2.md Session 2's tenure-clock rule ("set from the first recorded shift/check-in, never
 * touched again") lives here so both the retrospective web form (src/app/checkin/
 * actions.ts) and the real-time kiosk/QR toggle (performKioskToggle below) apply it
 * identically.
 */
export async function maybeSetFirstShiftDate(volunteer: { id: string; firstShiftDate: Date | null }, checkInAt: Date) {
  if (volunteer.firstShiftDate) return
  await withChangeLog(prisma, volunteer.id, "First shift date set from first check-in").volunteer.update({
    where: { id: volunteer.id },
    data: { firstShiftDate: checkInAt }
  })
}
```

**Change to make:** insert a new exported function immediately **after** `maybeSetFirstShiftDate` and **before** the `startOfDay` function that follows it. Add exactly this:

```ts

/**
 * Finds the Shift row for this date+type if it already exists; otherwise creates it through
 * withChangeLog so the CREATE is actually captured (a plain prisma.shift.upsert() bypasses
 * ChangeLog entirely, since `upsert` isn't one of the operations the extension hooks — only
 * `create` and `update` are). Every call site that used to call prisma.shift.upsert() directly
 * should call this instead.
 */
export async function findOrCreateShift(changedBy: string, date: Date, type: "AM" | "PM") {
  const existing = await prisma.shift.findUnique({ where: { date_type: { date, type } } })
  if (existing) return existing
  return withChangeLog(prisma, changedBy, "Shift occurrence created").shift.create({
    data: { date, type }
  })
}
```

Do not change anything else in the file for this task — `startOfDay`, `performKioskToggle`, and everything else stay exactly as they are for now (later tasks will touch `performKioskToggle`).

**Boundaries:** only add the new function shown above. Do not modify `maybeSetFirstShiftDate`, imports, or anything below the insertion point in this task.

**Success check:** run
```
grep -n "export async function findOrCreateShift" src/lib/checkin.ts
```
It should print exactly one line. Also run `npx tsc --noEmit` (or your project's typecheck command) — it should not report any new errors in `src/lib/checkin.ts`.

---

## Task 2 — Use `findOrCreateShift` in `submitCheckIn` (`src/app/checkin/actions.ts`)

**Requires:** Task 1 done first.

**File to edit:** `src/app/checkin/actions.ts`

**Current code:**

```ts
  const checkInAt = new Date(`${date}T${checkInTime}:00`)
  const checkOutAt = new Date(`${date}T${checkOutTime}:00`)

  const shift = await prisma.shift.upsert({
    where: { date_type: { date: new Date(date), type: shiftType } },
    update: {},
    create: { date: new Date(date), type: shiftType }
  })

  await withChangeLog(prisma, volunteer.id, "Self-service check-in").checkIn.create({
```

**Replace with:**

```ts
  const checkInAt = new Date(`${date}T${checkInTime}:00`)
  const checkOutAt = new Date(`${date}T${checkOutTime}:00`)

  const shift = await findOrCreateShift(volunteer.id, new Date(date), shiftType)

  await withChangeLog(prisma, volunteer.id, "Self-service check-in").checkIn.create({
```

You also need to add `findOrCreateShift` to the import at the top of the file. **Current code:**

```ts
import { maybeSetFirstShiftDate } from "@/lib/checkin"
```

**Replace with:**

```ts
import { maybeSetFirstShiftDate, findOrCreateShift } from "@/lib/checkin"
```

**Boundaries:** only touch the `submitCheckIn` function and the import line shown. Do not touch `setShiftActualTimes` or `updateOwnCheckIn` in this same file yet — those are Task 3 and are not part of this task.

**Success check:**
```
grep -n "findOrCreateShift" src/app/checkin/actions.ts
```
should show the import line plus one usage inside `submitCheckIn`. `grep -c "prisma.shift.upsert" src/app/checkin/actions.ts` should now show `1` (only `setShiftActualTimes` still has one, until Task 3).

---

## Task 3 — Use `findOrCreateShift` in `setShiftActualTimes` (`src/app/checkin/actions.ts`)

**Requires:** Tasks 1 and 2 done first (the import was already added in Task 2).

**File to edit:** `src/app/checkin/actions.ts`

**Current code:**

```ts
  const actualStartTime = String(formData.get("actualStartTime"))
  const actualEndTime = String(formData.get("actualEndTime"))

  const shift = await prisma.shift.upsert({
    where: { date_type: { date: new Date(date), type: shiftType } },
    update: {},
    create: { date: new Date(date), type: shiftType }
  })

  await withChangeLog(prisma, actor.id, "Shift actual time override").shift.update({
```

**Replace with:**

```ts
  const actualStartTime = String(formData.get("actualStartTime"))
  const actualEndTime = String(formData.get("actualEndTime"))

  const shift = await findOrCreateShift(actor.id, new Date(date), shiftType)

  await withChangeLog(prisma, actor.id, "Shift actual time override").shift.update({
```

**Boundaries:** only this one function. `submitCheckIn` (Task 2) and `updateOwnCheckIn` are not touched here.

**Success check:**
```
grep -c "prisma.shift.upsert" src/app/checkin/actions.ts
```
should now print `0`. `grep -n "findOrCreateShift" src/app/checkin/actions.ts` should show the import plus two usages now.

---

## Task 4 — Use `findOrCreateShift` in `performKioskToggle` (`src/lib/checkin.ts`)

**Requires:** Task 1 done first.

**File to edit:** `src/lib/checkin.ts`

**Current code:**

```ts
  const [farmSettings, templates] = await Promise.all([getFarmSettings(), prisma.shiftTemplate.findMany()])
  const shiftType = determineShiftTypeForNow(templates, farmSettings.activeSeason, now)
  const date = startOfDay(now)

  const shift = await prisma.shift.upsert({
    where: { date_type: { date, type: shiftType } },
    update: {},
    create: { date, type: shiftType }
  })

  const workType = await prisma.workType.findFirst({ where: { name: DEFAULT_KIOSK_WORK_TYPE, active: true } })
```

**Replace with:**

```ts
  const [farmSettings, templates] = await Promise.all([getFarmSettings(), prisma.shiftTemplate.findMany()])
  const shiftType = determineShiftTypeForNow(templates, farmSettings.activeSeason, now)
  const date = startOfDay(now)

  const shift = await findOrCreateShift(volunteer.id, date, shiftType)

  const workType = await prisma.workType.findFirst({ where: { name: DEFAULT_KIOSK_WORK_TYPE, active: true } })
```

Note: `performKioskToggle` is in the same file as `findOrCreateShift` (added in Task 1), so **no new import is needed** for this task — it's already in scope.

**Boundaries:** only this block inside `performKioskToggle`. Do not touch the rest of the function (the earlier "check-out" branch, `maybeSetFirstShiftDate`, or the return statement).

**Success check:**
```
grep -c "prisma.shift.upsert" src/lib/checkin.ts
```
should now print `0`.

---

## Task 5 — Use `findOrCreateShift` in `assignShiftLead` (`src/app/checkin/roster/actions.ts`)

**Requires:** Task 1 done first.

**File to edit:** `src/app/checkin/roster/actions.ts`

**Current code:**

```ts
  const rawLeadId = formData.get("assignedLeadId")
  const assignedLeadId = rawLeadId && String(rawLeadId).length > 0 ? String(rawLeadId) : null

  const shift = await prisma.shift.upsert({
    where: { date_type: { date: new Date(date), type: shiftType } },
    update: {},
    create: { date: new Date(date), type: shiftType }
  })

  await withChangeLog(prisma, actor.id, "Occurrence shift lead assignment").shift.update({
```

**Replace with:**

```ts
  const rawLeadId = formData.get("assignedLeadId")
  const assignedLeadId = rawLeadId && String(rawLeadId).length > 0 ? String(rawLeadId) : null

  const shift = await findOrCreateShift(actor.id, new Date(date), shiftType)

  await withChangeLog(prisma, actor.id, "Occurrence shift lead assignment").shift.update({
```

You also need to add the import. **Current code** (top of file):

```ts
import { canManageShiftRoster } from "@/lib/shiftRoster"
```

**Replace with:**

```ts
import { canManageShiftRoster } from "@/lib/shiftRoster"
import { findOrCreateShift } from "@/lib/checkin"
```

**Boundaries:** only `assignShiftLead` and the import in this task. `submitRosterAttendance` (further down in the same file) is Task 6 — do not touch it yet.

**Success check:**
```
grep -n "findOrCreateShift" src/app/checkin/roster/actions.ts
```
should show the import plus one usage. `grep -c "prisma.shift.upsert" src/app/checkin/roster/actions.ts` should show `1` (only `submitRosterAttendance` left, until Task 6).

---

## Task 6 — Use `findOrCreateShift` in `submitRosterAttendance` (`src/app/checkin/roster/actions.ts`)

**Requires:** Tasks 1 and 5 done first (import already added in Task 5).

**File to edit:** `src/app/checkin/roster/actions.ts`

**Current code:**

```ts
export async function submitRosterAttendance(date: string, shiftType: ShiftTypeValue, formData: FormData) {
  const actor = await requireNonKioskVolunteer()

  const shift = await prisma.shift.upsert({
    where: { date_type: { date: new Date(date), type: shiftType } },
    update: {},
    create: { date: new Date(date), type: shiftType }
  })

  if (!canManageShiftRoster(actor, shift)) throw new Error("Not authorized")
```

**Replace with:**

```ts
export async function submitRosterAttendance(date: string, shiftType: ShiftTypeValue, formData: FormData) {
  const actor = await requireNonKioskVolunteer()

  const shift = await findOrCreateShift(actor.id, new Date(date), shiftType)

  if (!canManageShiftRoster(actor, shift)) throw new Error("Not authorized")
```

**Boundaries:** only this one block. Note this task alone still leaves the permission check running after the write — that ordering problem is fixed separately in Task 8. Do not try to fix the ordering issue in this task; just do the mechanical `findOrCreateShift` swap shown above and stop.

**Success check:**
```
grep -c "prisma.shift.upsert" src/app/checkin/roster/actions.ts
```
should now print `0`.

---

## Task 7 — Use `findOrCreateShift` in `submitShiftReport` (`src/app/checkin/shift-report/actions.ts`)

**Requires:** Task 1 done first.

**File to edit:** `src/app/checkin/shift-report/actions.ts`

**Current code:**

```ts
export async function submitShiftReport(date: string, shiftType: ShiftTypeValue, formData: FormData) {
  const actor = await requireNonKioskVolunteer()

  const shift = await prisma.shift.upsert({
    where: { date_type: { date: new Date(date), type: shiftType } },
    update: {},
    create: { date: new Date(date), type: shiftType }
  })

  if (!canSubmitShiftReport(actor, shift)) throw new Error("Not authorized")
```

**Replace with:**

```ts
export async function submitShiftReport(date: string, shiftType: ShiftTypeValue, formData: FormData) {
  const actor = await requireNonKioskVolunteer()

  const shift = await findOrCreateShift(actor.id, new Date(date), shiftType)

  if (!canSubmitShiftReport(actor, shift)) throw new Error("Not authorized")
```

You also need to add the import. **Current code** (top of file):

```ts
import { canSubmitShiftReport } from "@/lib/shiftReport"
import type { ShiftTypeValue } from "@/lib/shifts"
```

**Replace with:**

```ts
import { canSubmitShiftReport } from "@/lib/shiftReport"
import type { ShiftTypeValue } from "@/lib/shifts"
import { findOrCreateShift } from "@/lib/checkin"
```

**Boundaries:** only this function and the import. Just like Task 6, leave the permission-check ordering alone here — that's Task 9.

**Success check:**
```
grep -c "prisma.shift.upsert" src/app/checkin/shift-report/actions.ts
```
should print `0`. After this task, run:
```
grep -rc "prisma.shift.upsert" src/app src/lib
```
Every file should show `0` — no `prisma.shift.upsert` call should remain anywhere in the codebase.

---

## Task 8 — Move the permission check before the write in `submitRosterAttendance`

**Requires:** Task 6 done first.

**Why:** right now, `submitRosterAttendance` creates a `Shift` row (a database write) *before* checking whether the caller is actually allowed to submit a roster for that shift. The fix is to look up the shift **read-only** first, check permission against that, and only create the row after the check passes.

**File to edit:** `src/app/checkin/roster/actions.ts`

**Current code** (this is what Task 6 left behind):

```ts
export async function submitRosterAttendance(date: string, shiftType: ShiftTypeValue, formData: FormData) {
  const actor = await requireNonKioskVolunteer()

  const shift = await findOrCreateShift(actor.id, new Date(date), shiftType)

  if (!canManageShiftRoster(actor, shift)) throw new Error("Not authorized")
```

**Replace with:**

```ts
export async function submitRosterAttendance(date: string, shiftType: ShiftTypeValue, formData: FormData) {
  const actor = await requireNonKioskVolunteer()

  const existingShift = await prisma.shift.findUnique({ where: { date_type: { date: new Date(date), type: shiftType } } })
  if (!canManageShiftRoster(actor, existingShift)) throw new Error("Not authorized")

  const shift = await findOrCreateShift(actor.id, new Date(date), shiftType)
```

**Boundaries:** only this block at the top of `submitRosterAttendance`. Everything below this point in the function (the `presentVolunteerIds` handling, the loop, etc.) stays exactly as-is — it already refers to a variable named `shift`, which still exists with the same shape after this change, so nothing else in the function needs to change.

**Success check:**
```
grep -n "canManageShiftRoster(actor, existingShift)" src/app/checkin/roster/actions.ts
```
should print one line, and it should appear **before** the `findOrCreateShift(actor.id, ...)` line in the same function (check by reading the line numbers — the `canManageShiftRoster` line number should be smaller than the `findOrCreateShift` line number). If a test database is available, run `npm run test:unit -- roster` and confirm no new failures.

---

## Task 9 — Move the permission check before the write in `submitShiftReport`

**Requires:** Task 7 done first.

**File to edit:** `src/app/checkin/shift-report/actions.ts`

**Current code:**

```ts
export async function submitShiftReport(date: string, shiftType: ShiftTypeValue, formData: FormData) {
  const actor = await requireNonKioskVolunteer()

  const shift = await findOrCreateShift(actor.id, new Date(date), shiftType)

  if (!canSubmitShiftReport(actor, shift)) throw new Error("Not authorized")
```

**Replace with:**

```ts
export async function submitShiftReport(date: string, shiftType: ShiftTypeValue, formData: FormData) {
  const actor = await requireNonKioskVolunteer()

  const existingShift = await prisma.shift.findUnique({ where: { date_type: { date: new Date(date), type: shiftType } } })
  if (!canSubmitShiftReport(actor, existingShift)) throw new Error("Not authorized")

  const shift = await findOrCreateShift(actor.id, new Date(date), shiftType)
```

**Boundaries:** only this block. Everything after it (the `existing` ShiftReport check, the template lookup, the response-creation loop) stays exactly as-is.

**Success check:**
```
grep -n "canSubmitShiftReport(actor, existingShift)" src/app/checkin/shift-report/actions.ts
```
should print one line, appearing before the `findOrCreateShift` line in the function.

---

## Task 10 — Add `orderBy` to the feeding-override include in `src/app/animals/[id]/page.tsx`

**Why:** when more than one `FeedingOverride` row exists for the same baseline on the same day (e.g. a correction logged later the same day), the code reads `baseline.overrides[0]` expecting it to be the most recent one. Without an explicit `orderBy` on this nested include, the order Postgres/Prisma returns rows in in this situation is not guaranteed, so `[0]` might be the original row, not the correction.

**File to edit:** `src/app/animals/[id]/page.tsx`

**Current code:**

```ts
  const feedingBaselines = await prisma.feedingBaseline.findMany({
    where: { animalId: id },
    include: { feedType: true, overrides: { where: { date: { gte: today, lt: tomorrow } } } },
    orderBy: [{ shift: "asc" }, { feedType: { name: "asc" } }]
  })
```

**Replace with:**

```ts
  const feedingBaselines = await prisma.feedingBaseline.findMany({
    where: { animalId: id },
    include: { feedType: true, overrides: { where: { date: { gte: today, lt: tomorrow } }, orderBy: { createdAt: "desc" } } },
    orderBy: [{ shift: "asc" }, { feedType: { name: "asc" } }]
  })
```

Only the `overrides: {...}` part changed — one `orderBy: { createdAt: "desc" }` key was added inside it. Nothing else on this line or elsewhere in the file changes.

**Boundaries:** only this exact `prisma.feedingBaseline.findMany` call. Do not touch the `medicationRegimens` query in the same file — that's Task 12.

**Success check:**
```
grep -n "overrides: { where: { date: { gte: today, lt: tomorrow } }, orderBy" src/app/animals/\[id\]/page.tsx
```
should print one line.

---

## Task 11 — Add `orderBy` to the feeding-override include in `src/app/dashboard/page.tsx`

**File to edit:** `src/app/dashboard/page.tsx`

**Current code:**

```ts
  const feedingBaselines = await prisma.feedingBaseline.findMany({
    where: { animalId: { in: animalIds } },
    include: { feedType: true, overrides: { where: { date: { gte: today, lt: tomorrow } } } },
    orderBy: [{ shift: "asc" }, { feedType: { name: "asc" } }]
  })
```

**Replace with:**

```ts
  const feedingBaselines = await prisma.feedingBaseline.findMany({
    where: { animalId: { in: animalIds } },
    include: { feedType: true, overrides: { where: { date: { gte: today, lt: tomorrow } }, orderBy: { createdAt: "desc" } } },
    orderBy: [{ shift: "asc" }, { feedType: { name: "asc" } }]
  })
```

**Boundaries:** only this query. Do not touch the `medicationRegimens` query further down in the same file (that's Task 13), and do not touch any JSX in this file.

**Success check:**
```
grep -n "overrides: { where: { date: { gte: today, lt: tomorrow } }, orderBy" src/app/dashboard/page.tsx
```
should print one line.

---

## Task 12 — Add `orderBy` to the medication-log include in `src/app/animals/[id]/page.tsx`

**Requires:** nothing (independent of Task 10, but same file — do Task 10 first anyway since tasks are done in numeric order).

**File to edit:** `src/app/animals/[id]/page.tsx`

**Current code:**

```ts
  const medicationRegimens = await prisma.medicationRegimen.findMany({
    where: { animalId: id, OR: [{ endDate: null }, { endDate: { gte: today } }] },
    include: { logs: { where: { date: { gte: today, lt: tomorrow } } } },
    orderBy: { drugName: "asc" }
  })
```

**Replace with:**

```ts
  const medicationRegimens = await prisma.medicationRegimen.findMany({
    where: { animalId: id, OR: [{ endDate: null }, { endDate: { gte: today } }] },
    include: { logs: { where: { date: { gte: today, lt: tomorrow } }, orderBy: { createdAt: "desc" } } },
    orderBy: { drugName: "asc" }
  })
```

**Boundaries:** only this query.

**Success check:**
```
grep -n "logs: { where: { date: { gte: today, lt: tomorrow } }, orderBy" src/app/animals/\[id\]/page.tsx
```
should print one line.

---

## Task 13 — Add `orderBy` to the medication-log include in `src/app/dashboard/page.tsx`

**File to edit:** `src/app/dashboard/page.tsx`

**Current code:**

```ts
  const medicationRegimens = await prisma.medicationRegimen.findMany({
    where: { animalId: { in: animalIds }, OR: [{ endDate: null }, { endDate: { gte: today } }] },
    include: { logs: { where: { date: { gte: today, lt: tomorrow } } } },
    orderBy: { drugName: "asc" }
  })
```

**Replace with:**

```ts
  const medicationRegimens = await prisma.medicationRegimen.findMany({
    where: { animalId: { in: animalIds }, OR: [{ endDate: null }, { endDate: { gte: today } }] },
    include: { logs: { where: { date: { gte: today, lt: tomorrow } }, orderBy: { createdAt: "desc" } } },
    orderBy: { drugName: "asc" }
  })
```

**Boundaries:** only this query.

**Success check:**
```
grep -n "logs: { where: { date: { gte: today, lt: tomorrow } }, orderBy" src/app/dashboard/page.tsx
```
should print one line.

---

## Task 14 — Add `orderBy` to the feeding-override include in `src/app/feed-board/page.tsx`

**File to edit:** `src/app/feed-board/page.tsx`

**Current code** (this is the `loadFeedingBaselines` helper function near the top of the file):

```ts
async function loadFeedingBaselines(animalIds: string[], shift: FeedBoardShift, today: Date, tomorrow: Date) {
  return prisma.feedingBaseline.findMany({
    where: { animalId: { in: animalIds }, shift },
    include: { feedType: true, overrides: { where: { date: { gte: today, lt: tomorrow } } } },
    orderBy: [{ feedType: { name: "asc" } }]
  })
}
```

**Replace with:**

```ts
async function loadFeedingBaselines(animalIds: string[], shift: FeedBoardShift, today: Date, tomorrow: Date) {
  return prisma.feedingBaseline.findMany({
    where: { animalId: { in: animalIds }, shift },
    include: { feedType: true, overrides: { where: { date: { gte: today, lt: tomorrow } }, orderBy: { createdAt: "desc" } } },
    orderBy: [{ feedType: { name: "asc" } }]
  })
}
```

**Boundaries:** only this function. Do not touch anything else in this file — it's a large file with a lot of JSX below this function; none of it is part of this task.

**Success check:**
```
grep -n "overrides: { where: { date: { gte: today, lt: tomorrow } }, orderBy" src/app/feed-board/page.tsx
```
should print one line.

**After finishing Tasks 10–14 together**, run this one combined check:
```
grep -rn "overrides: { where: { date: { gte: today, lt: tomorrow } } }$" src/app
grep -rn "logs: { where: { date: { gte: today, lt: tomorrow } } }$" src/app
```
Both commands should print **nothing** (no matches) — every remaining occurrence of these patterns should now have the added `, orderBy: { createdAt: "desc" }` and therefore not match a line ending exactly in `} }`.

---

## Task 15 — Only revalidate the layout when a chat message is pinned

**File to edit:** `src/app/chat/actions.ts`

**Why:** the comment already in this file explains that revalidating the whole app layout is only needed so a newly pinned message shows up in the alert banner right away — but the code currently does it for every chat message, pinned or not.

**Current code:**

```ts
  // A pinned message needs the global banner (rendered from src/app/AlertBanner.tsx, inside
  // the root layout) to reflect it immediately — but redirect() only guarantees a fresh render
  // of the page segment it targets, not ancestor layout segments shared across the whole app.
  // Every prior Server Action in this codebase only ever needed its own destination page fresh
  // (CLAUDE.md's existing actions all redirect within a single route's own data); this is the
  // first one whose write needs to invalidate something rendered above it in the tree, so
  // revalidatePath("/", "layout") — Next's documented way to revalidate every route sharing a
  // layout — is needed here specifically, not because every action needs this going forward.
  revalidatePath("/", "layout")

  redirect(`/chat?channelId=${channelId}`)
```

**Replace with:**

```ts
  // A pinned message needs the global banner (rendered from src/app/AlertBanner.tsx, inside
  // the root layout) to reflect it immediately — but redirect() only guarantees a fresh render
  // of the page segment it targets, not ancestor layout segments shared across the whole app.
  // Every prior Server Action in this codebase only ever needed its own destination page fresh
  // (CLAUDE.md's existing actions all redirect within a single route's own data); this is the
  // first one whose write needs to invalidate something rendered above it in the tree, so
  // revalidatePath("/", "layout") — Next's documented way to revalidate every route sharing a
  // layout — is needed here specifically, not because every action needs this going forward.
  // Only pinned messages affect the banner, so only they need to pay for the wider revalidation.
  if (pinned) {
    revalidatePath("/", "layout")
  }

  redirect(`/chat?channelId=${channelId}`)
```

**Boundaries:** only this block at the end of `postChatMessage`. Do not touch the `prisma.chatMessage.create(...)` call above it, and do not touch the import line (`revalidatePath` is still used, just conditionally, so the import stays exactly as it is).

**Success check:**
```
grep -n "if (pinned) {" src/app/chat/actions.ts
```
should print one line, and the line right after it (or within the next 2 lines) should be `revalidatePath("/", "layout")`.

---

## Task 16 — Sync `CLAUDE.md`'s tracked-models list with the actual code

**File to edit:** `CLAUDE.md`

**Why:** `src/lib/prisma.ts`'s `trackedModels` array (the actual source of truth) has 17 entries, but `CLAUDE.md`'s own reference list under "ChangeLog Implementation" only lists 14 — it's missing `Shift`, `AnimalRelationship`, and `ShiftReport`, even though other parts of the same `CLAUDE.md` file already describe those three as tracked. This task only fixes the one out-of-date list; it does not change any code.

**Current code** (this is a sentence inside the "ChangeLog Implementation" section of `CLAUDE.md` — search for it, don't guess the surrounding line numbers since they may have shifted):

```
Tracked models (per `CONTEXT.md` §4): `Animal`, `Volunteer`, `FeedingBaseline`, `FeedingOverride`, `MedicationRegimen`, `MedicationLog`, `CareEntry`, `HealthIssue`, `WeightEntry`, `AnimalMetric`, `Placement`, `CredentialRecord`, `CheckIn`, `VolunteerTagAssignment`. Add new models to the `trackedModels` array in `src/lib/prisma.ts` when they're introduced, not to a separate list — there is only one source of truth for what's tracked.
```

**Replace with:**

```
Tracked models (per `CONTEXT.md` §4): `Animal`, `Volunteer`, `FeedingBaseline`, `FeedingOverride`, `MedicationRegimen`, `MedicationLog`, `CareEntry`, `HealthIssue`, `WeightEntry`, `AnimalMetric`, `Placement`, `CredentialRecord`, `CheckIn`, `VolunteerTagAssignment`, `Shift`, `AnimalRelationship`, `ShiftReport`. Add new models to the `trackedModels` array in `src/lib/prisma.ts` when they're introduced, not to a separate list — there is only one source of truth for what's tracked.
```

Only the list of backtick-quoted model names changed (three names — `` `Shift` ``, `` `AnimalRelationship` ``, `` `ShiftReport` `` — were added before the final period-ending sentence). The rest of the sentence is identical.

**Boundaries:** this is a Markdown documentation file, not code. Only change the one sentence shown. Do not reformat, reword, or touch any other part of `CLAUDE.md`.

**Success check:**
```
grep -n "Tracked models (per \`CONTEXT.md\` §4)" CLAUDE.md
```
The matching line should contain all 17 model names, including `` `Shift` ``, `` `AnimalRelationship` ``, and `` `ShiftReport` ``.

---

## Final combined check (run once after all 16 tasks are done)

```
grep -rc "prisma.shift.upsert" src/app src/lib
```
Every result should be `0`.

```
grep -rn "overrides: { where: { date: { gte: today, lt: tomorrow } } }$" src/app
grep -rn "logs: { where: { date: { gte: today, lt: tomorrow } } }$" src/app
```
Both should print nothing.

```
grep -c "findOrCreateShift" src/lib/checkin.ts
```
Should be at least `2` (the function definition plus its use inside `performKioskToggle`).

If a Postgres test database is available in your environment (see the project's `README.md` / `CLAUDE.md` Testing section for `npm run test:db:reset`), run:
```
npm run test:unit
```
No test should newly fail because of these changes. If a test database is not available, the `grep`/`tsc` checks above are the best available verification — do not attempt to start Docker or provision a database yourself as part of these tasks.
