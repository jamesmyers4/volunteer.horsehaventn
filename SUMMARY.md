# Backend/Logic Audit — SUMMARY.md

**Date:** 2026-07-25
**Scope:** Server Actions, Route Handlers, `src/lib/*`, Prisma schema, ChangeLog extension, auth/permission gating. UI/styling/layout was deliberately **not** reviewed per request, except the shared navigation shell (`NavBar.tsx`, `AlertBanner.tsx`, `BfcacheReload.tsx`) since those are common/global rather than page-specific.

**Method:** Read the full Prisma schema, every file under `src/lib/`, every Server Action file under `src/app/`, both Route Handlers, `src/proxy.ts`, `src/lib/auth.ts`, the root layout, and cross-checked several findings against the existing Vitest suite to confirm they weren't already covered/intentional. Every finding below was verified by reading the actual current source — nothing here is a guess from the docs alone.

This audit does **not** re-flag things `CLAUDE.md`/`CONTEXT.md`/`HANDOFF.md` already document as known, open, or deliberately deferred (e.g. the RP1–RP6 turnout-order approximation, the `requiredTagId`+`requiredTier` AND-interpretation, Shift-Lead write access to `MedicationLog`/`HealthIssue` being an inferred judgment call). Those are already tracked; repeating them here would just be noise.

---

## Quick-reference table

| # | Severity | Area | One-line summary |
|---|----------|------|-------------------|
| 1 | High | Auth | `Volunteer.status` is never checked by any auth gate — INACTIVE volunteers keep full access |
| 2 | High | ChangeLog | `Shift` row **creation** bypasses ChangeLog entirely (6 call sites use `.upsert()`, which the extension doesn't hook) |
| 3 | Medium | Auth data | Clerk webhook re-link path doesn't restore `status: "ACTIVE"` on a previously-deactivated volunteer |
| 4 | Medium | Data display | Missing `orderBy` on "today's override/log" nested includes — a same-day correction can silently show stale data |
| 5 | Medium | Auth ordering | Two actions write to the DB (`shift.upsert`) *before* checking whether the caller is authorized |
| 6 | Low | Concurrency | `signupForEvent` capacity check has a check-then-act race under concurrent signups |
| 7 | Low | Consistency | `submitCheckIn`/`submitRosterAttendance`/`updateOwnCheckIn` parse check-in times in server-local time, inconsistent with this codebase's own documented UTC-string convention |
| 8 | Low | Correctness | `postChatMessage` revalidates the entire layout on every ordinary chat message, not just pinned ones |
| 9 | Low | Docs | `CLAUDE.md`'s "Tracked models" list is stale (missing `Shift`, `AnimalRelationship`, `ShiftReport`) |
| 10 | Low | Permissions clarity | Photo upload route has no role gate beyond "signed in, non-kiosk" — not documented either way |

---

## 1. `Volunteer.status` is never enforced anywhere in the auth path (High)

**Files:** `src/lib/auth.ts` (lines 6–37)

`getCurrentVolunteer()`, `requireVolunteer()`, `requireRole()`, and `requireNonKioskVolunteer()` all resolve a Clerk session to a `Volunteer` row and check only `role`. None of them check `status`:

```ts
export async function getCurrentVolunteer() {
  const { isAuthenticated, userId } = await auth()
  if (!isAuthenticated || !userId) return null
  return prisma.volunteer.findUnique({ where: { clerkId: userId } })
}
```

`VolunteerStatus` (`ACTIVE | INACTIVE`) exists in the schema and is used to **filter read queries** in several places (`volunteers/page.tsx`, `checkin/roster/page.tsx`, `events/page.tsx`, `lib/training.ts`, `lib/tags.ts` — all `where: { status: "ACTIVE" }`), which strongly implies the intent is "an inactive volunteer isn't really part of the org anymore." But nothing stops an INACTIVE volunteer from signing in and using every write action their `role` allows, as long as their `Volunteer.clerkId` still matches a valid Clerk session.

There is also **no admin-facing action to set a volunteer's status at all**. Grepped the entire `src/app` tree for any write to `Volunteer.status` — the only place it's ever set is:
- `status: "ACTIVE"` on brand-new signup (Clerk webhook `user.created`)
- `status: "INACTIVE"` on Clerk `user.deleted`

There's no `updateVolunteerStatus` action anywhere (compare to `updateVolunteerRole`/`updateCanScheduleEvents` in `src/app/admin/volunteers/actions.ts`, which exist for the other two admin-settable fields). So today, the only way a volunteer becomes INACTIVE is if their Clerk account itself is deleted — and if that happens, their Clerk session is invalidated too, so the missing status-check is currently masked by the fact that the one real-world path that sets INACTIVE also happens to revoke their ability to authenticate at all.

**Why this matters anyway:** the moment Horse Haven wants to deactivate someone *without* deleting their Clerk account (the far more common real-world case — someone stops volunteering but you don't want to nuke their login, or you want to temporarily suspend access during a dispute), there's no way to do it, and if a future session adds one (e.g. a `deactivateVolunteer()` action, the natural next step given the other two admin toggles), it will silently do nothing unless the auth layer is also fixed. This is exactly the kind of gap `CLAUDE.md`'s own "auto-capture, don't rely on remembering" philosophy (the reasoning behind `KIOSK` and `requireNonKioskVolunteer`) was designed to prevent — but it wasn't applied to `status`.

**Suggested fix:** either (a) add a status check to `requireVolunteer()` itself (throwing "Account inactive" for `status !== "ACTIVE"`), or (b) if `GUEST`'s time-boxed `accessValidFrom/accessValidUntil` needs different handling than a flat ACTIVE/INACTIVE check, make the status check its own small helper called from `requireVolunteer()`. Also add the missing `updateVolunteerStatus` (or `deactivateVolunteer`/`reactivateVolunteer`) admin action so `status` is actually reachable from the UI. This is a real design decision (what error message, does GUEST's time-box interact with it, should `KIOSK` accounts even have a status field that matters) — flagged here for a human call, not included in the local-AI task list.

---

## 2. `Shift` row creation bypasses ChangeLog entirely — `.upsert()` isn't hooked by the extension (High)

**Files:** `src/lib/prisma.ts` (the extension itself), and 6 call sites:
- `src/app/checkin/actions.ts` — `submitCheckIn` (line 21), `setShiftActualTimes` (line 63)
- `src/lib/checkin.ts` — `performKioskToggle` (line 66)
- `src/app/checkin/roster/actions.ts` — `assignShiftLead` (line 29), `submitRosterAttendance` (line 54)
- `src/app/checkin/shift-report/actions.ts` — `submitShiftReport` (line 21)

`Shift` **is** in `withChangeLog`'s `trackedModels` array (`src/lib/prisma.ts` line 27), and the schema's own comment on `Shift.actualStartTime` says "who/when is captured by ChangeLog (Shift is a tracked model)." But the extension only intercepts the `create` and `update` query operations:

```ts
export function withChangeLog(base: PrismaClient, changedBy: string, note?: string) {
  return base.$extends({
    name: "changeLog",
    query: {
      $allModels: {
        async create({ model, args, query }) { /* ...logs CREATE... */ },
        async update({ model, args, query }) { /* ...logs UPDATE... */ }
      }
    }
  })
}
```

Prisma Client Extensions key their `query` hooks by the **exact operation name** the caller invokes. `upsert` is its own top-level operation, distinct from `create`/`update` — it does not fire either hook. Every one of the 6 call sites above creates the very first `Shift` row for a given date+type via:

```ts
const shift = await prisma.shift.upsert({
  where: { date_type: { date: new Date(date), type: shiftType } },
  update: {},
  create: { date: new Date(date), type: shiftType }
})
```

...using the **plain `prisma` client**, not a `withChangeLog(...)`-wrapped one — and even if it were wrapped, the CREATE branch still wouldn't be logged, because `upsert` isn't one of the two hooked operations. Only later `.update()` calls on that same `Shift` row (`setShiftActualTimes`, `assignShiftLead`, both of which correctly call `withChangeLog(...).shift.update(...)`) get logged. Net effect: **every `Shift` row's initial creation is invisible to ChangeLog**, and only gets a ChangeLog trail once someone later sets `actualStartTime`/`assignedLeadId` on it.

**Confirmed not already covered:** `tests/vitest/actions/checkin.test.ts` line 195 does assert `ChangeLog` entries exist for `entityType: "Shift"` — but that test is checking the result of `setShiftActualTimes` (an `.update()`), not the `upsert`-created row. There's no test anywhere asserting a `ChangeLog` CREATE entry exists for a freshly-created `Shift`.

**Practical impact:** low on its own (a `Shift` row's only fields are `date`/`type`, not very interesting to audit), but it's a real inconsistency with the documented guarantee, and it means "who first checked in for AM on 2026-07-20, creating that occurrence" is unrecoverable — which matters more once `assignedLeadId`/`actualStartTime` corrections pile up on top of an occurrence nobody can see the origin of.

**Suggested fix:** included in the local-AI task list (`SUMMARY-LOCAL-AI.md` tasks 1–7) — replace the bare `upsert` with a small `findOrCreateShift()` helper that does a `findUnique` first and only calls `withChangeLog(...).shift.create(...)` when the row doesn't exist yet.

---

## 3. Clerk webhook re-link doesn't restore `status: "ACTIVE"` (Medium)

**File:** `src/app/api/webhooks/clerk/route.ts`, `user.created` handler (lines 14–30)

```ts
const existing = email ? await prisma.volunteer.findFirst({ where: { email, clerkId: null } }) : null

if (existing) {
  await withChangeLog(prisma, existing.id, "Linked Clerk account to existing volunteer record").volunteer.update({
    where: { id: existing.id },
    data: { clerkId: id }
  })
}
```

This path exists specifically to link a fresh Clerk signup to an admin-pre-entered `Volunteer` row (per `CLAUDE.md`'s note on this exact handler). But it's also the *only* path that matches a volunteer who was previously deactivated via the `user.deleted` handler (`clerkId: null, status: "INACTIVE"`) — if that same person's email later signs up again in Clerk (e.g., they left and came back, or their old Clerk account was deleted by mistake and they're re-invited), this same `findFirst({ where: { email, clerkId: null } })` will match their old, now-INACTIVE row and re-link it — without ever setting `status` back to `"ACTIVE"`.

Given finding #1 above, this doesn't currently block their access (status isn't enforced), but it does mean they'll silently disappear from every `status: "ACTIVE"`-filtered read: the volunteer directory, the default shift roster, the training-compliance report, the tag-eligibility report, and the events attendee list — despite being a fully signed-in, actively checking-in volunteer. If finding #1 is ever fixed (status starts gating access), this becomes a real "why can't this person log in" support issue, because nothing in the webhook flow ever flips them back to ACTIVE.

**Suggested fix:** when re-linking an existing row in `user.created`, also set `status: "ACTIVE"` as part of the same update. Small, mechanical, low-risk — this is included as a candidate for the local-AI task list once #1's design decision is made, but is held out of the *initial* local-AI list because it should probably be fixed together with #1 rather than independently (fixing it alone changes data but the behavior gap it's covering for doesn't exist until #1 is addressed).

---

## 4. Missing `orderBy` on "today's override/log" nested includes (Medium)

**Files:**
- `src/app/animals/[id]/page.tsx` — line 40 (`FeedingBaseline.overrides`), line 48 (`MedicationRegimen.logs`)
- `src/app/dashboard/page.tsx` — line 25 (`overrides`), line 37 (`logs`)
- `src/app/feed-board/page.tsx` — line 11 (`overrides`)

All five queries look like this (feeding example, `dashboard/page.tsx` lines 23–27):

```ts
const feedingBaselines = await prisma.feedingBaseline.findMany({
  where: { animalId: { in: animalIds } },
  include: { feedType: true, overrides: { where: { date: { gte: today, lt: tomorrow } } } },
  orderBy: [{ shift: "asc" }, { feedType: { name: "asc" } }]
})
```

The **outer** `findMany` has an `orderBy`, but the **nested** `overrides`/`logs` include does not. Every call site then reads `baseline.overrides[0]` (or `regimen.logs[0]`) and treats it as "today's override"/"today's log entry" — e.g. `src/app/dashboard/page.tsx` lines 118 and 146, `src/app/animals/[id]/page.tsx` lines 333 and 413, `src/app/feed-board/page.tsx` lines 167, 255, and 306.

Nothing in the schema or the create actions (`createFeedingOverride`, `logMedicationAdministered`) prevents **more than one** `FeedingOverride`/`MedicationLog` row for the same baseline/regimen on the same day — e.g. a shift lead logs an override, then a second shift lead corrects it later the same day with a second row (there's no unique constraint on `(feedingBaselineId, date)` or `(medicationRegimenId, date)`, and no app-side check against a duplicate). Without an explicit `orderBy` on the nested include, Postgres/Prisma does not guarantee which row comes back first — `[0]` could be the original, not the correction. In practice this often *happens* to reflect insertion order, but that's not a guarantee the SQL standard or Prisma's docs make, and it's exactly the kind of thing that only breaks in production, intermittently, under real concurrent use.

**Suggested fix:** add `orderBy: { createdAt: "desc" }` to each of the 5 nested includes, so `[0]` is always deterministically "the most recent one." Included in the local-AI task list (tasks 10–14) — genuinely mechanical, one line added per file/location, no behavior change in the (currently far more common) single-override-per-day case.

---

## 5. Authorization check runs *after* a DB write in two actions (Medium)

**Files:** `src/app/checkin/roster/actions.ts` — `submitRosterAttendance` (lines 51–60); `src/app/checkin/shift-report/actions.ts` — `submitShiftReport` (lines 18–27)

Both functions call `requireNonKioskVolunteer()` (which only requires *any* signed-in non-kiosk account — no role check), then immediately do a **write** (`prisma.shift.upsert(...)`, which will `INSERT` a brand-new `Shift` row if none exists for that date+type), and only *after* that check whether the caller is actually allowed to submit a roster/report for that shift:

```ts
export async function submitRosterAttendance(date: string, shiftType: ShiftTypeValue, formData: FormData) {
  const actor = await requireNonKioskVolunteer()

  const shift = await prisma.shift.upsert({ /* ...write... */ })

  if (!canManageShiftRoster(actor, shift)) throw new Error("Not authorized")
  // ...
```

A plain `VOLUNTEER` (not a lead, not admin, not this occurrence's `assignedLeadId`) who calls either action gets correctly rejected — but only *after* the `Shift` row for that arbitrary date+type has already been created. This isn't currently a data-integrity risk (the created row is empty/harmless, and per finding #2 it isn't even logged), but it's the wrong order on principle: a permission check that runs after a mutation has already happened is not really a permission check on that mutation. It also means any signed-in volunteer can silently pre-create `Shift` rows for arbitrary future dates just by calling either action and getting rejected — not exploitable for anything today, but worth closing since the fix is small.

**Suggested fix:** do a **read-only** `findUnique` on `Shift` first, check the permission against that (a `null` shift is a valid input to both `canManageShiftRoster`/`canSubmitShiftReport`, which both accept `shift: {...} | null`), and only perform the `upsert`/`create` once the check passes. Included in the local-AI task list (tasks 8–9), sequenced after the ChangeLog fix for the same call sites (task 6/7) since both touch the same few lines.

---

## 6. `signupForEvent` capacity check has a check-then-act race (Low)

**File:** `src/app/events/[id]/signup-actions.ts`, lines 52–58

```ts
const confirmedCount = await prisma.eventSignup.count({ where: { eventId, status: "CONFIRMED" } })
const status = event.capacity === null || confirmedCount < event.capacity ? "CONFIRMED" : "WAITLISTED"

if (existing) {
  await prisma.eventSignup.update({ where: { id: existing.id }, data: { status, signedUpAt: new Date(), canceledAt: null } })
} else {
  await prisma.eventSignup.create({ data: { eventId, volunteerId: volunteer.id, status } })
}
```

The count-then-compare isn't wrapped in a transaction and there's no DB-level constraint capping confirmed signups at `capacity`. Two volunteers signing up for the last open seat at nearly the same moment could both read `confirmedCount < capacity` as true and both get `CONFIRMED`, overbooking the event by one (or more, the more concurrent the requests). Given this is a small volunteer organization signing up for barn events (not a high-traffic ticketing system), the realistic odds of two people racing for literally the same last second are low — flagging this as a known limitation rather than something urgent to fix, but worth a comment in the code (or a `$transaction` with a re-check) if this ever becomes a real complaint (e.g. an event repeatedly shows one more confirmed attendee than its stated capacity).

Not included in the local-AI task list — fixing this correctly needs either a serializable transaction or a DB-level constraint/trigger, which is more architecture than a single mechanical edit.

---

## 7. Timezone-inconsistent date parsing in check-in flows (Low)

**Files:** `src/app/checkin/actions.ts` — `submitCheckIn` (line 18–19), `updateOwnCheckIn` (lines 97–98); `src/app/checkin/roster/actions.ts` — `submitRosterAttendance` (lines 79–80)

This codebase has an explicit, documented convention (see `src/lib/checkin.ts`'s own `startOfDay` comment and `src/lib/facilityTasks.ts`'s matching `startOfDay`): parse calendar dates via `date.toISOString().slice(0, 10)` or `new Date(dateString)` (a date-only ISO string, always parsed as UTC midnight), specifically to avoid the well-known JS gotcha where a **date-time** string with no explicit UTC marker parses in the **server process's local timezone** instead.

`submitCheckIn` builds the actual check-in/out timestamps like this:

```ts
const checkInAt = new Date(`${date}T${checkInTime}:00`)
const checkOutAt = new Date(`${date}T${checkOutTime}:00`)
```

This string has no `Z`/offset suffix, so per the ECMA-262 spec it's parsed in **local time**, not UTC — inconsistent with the `Shift.date` field built two lines later via `new Date(date)` (parsed as UTC midnight) in the very same function. `updateOwnCheckIn` and `submitRosterAttendance` do the same thing.

**Why this is low severity, not high:** Vercel's serverless functions run with `TZ=UTC` by default, so in production this almost certainly never manifests — "local time" and "UTC" are the same thing on the deployed app. It only bites if this code ever runs somewhere with a different `TZ` (a developer's own machine during `npm run dev` in a non-UTC timezone, a future host that doesn't default to UTC, or a CI runner with a different locale) — in which case a check-in near midnight could resolve to the wrong calendar day relative to the `Shift` row it's attached to. Worth fixing for portability and to match the codebase's own stated convention, but not urgent.

Not included in the local-AI task list — while mechanical, this needs a judgment call about whether to append an explicit `Z`/UTC-offset marker (changing what "9am" the volunteer typed actually means in absolute time — a real behavior question, not a no-op refactor) versus some other normalization, so it's flagged for a human decision rather than handed to an unsupervised local model.

---

## 8. `postChatMessage` revalidates the whole layout on every message, not just pinned ones (Low)

**File:** `src/app/chat/actions.ts`, lines 43–53

```ts
// A pinned message needs the global banner ... to reflect it immediately ...
revalidatePath("/", "layout")

redirect(`/chat?channelId=${channelId}`)
```

The comment directly above this call explains, correctly, that `revalidatePath("/", "layout")` exists so a newly-**pinned** message shows up in `AlertBanner` right away. But the call itself is unconditional — it runs for every ordinary chat message too, not just `pinned` ones. This doesn't break anything (over-revalidating is safe, just wasteful), but it means every regular chat post pays the cost of invalidating every cached route sharing the root layout — i.e. the entire app — for no reason tied to what the comment says it's for.

**Suggested fix:** included in the local-AI task list (task 15) — wrap the existing call in `if (pinned) { ... }`.

---

## 9. `CLAUDE.md`'s "Tracked models" reference list is stale (Low, docs-only)

**Files:** `CLAUDE.md` (the "ChangeLog Implementation" section's tracked-models bullet) vs. `src/lib/prisma.ts` lines 12–30

`CLAUDE.md` states:

> Tracked models (per `CONTEXT.md` §4): `Animal`, `Volunteer`, `FeedingBaseline`, `FeedingOverride`, `MedicationRegimen`, `MedicationLog`, `CareEntry`, `HealthIssue`, `WeightEntry`, `AnimalMetric`, `Placement`, `CredentialRecord`, `CheckIn`, `VolunteerTagAssignment`.

— 14 models. The actual `trackedModels` array in code has 17: those 14 plus `Shift`, `AnimalRelationship`, and `ShiftReport`. Later prose elsewhere in the *same file* (the V2 Session 5, V3 Session 1, and V3 Session 5 bullets under "Repo Layout") does correctly describe each of those three as tracked — so this isn't a case of someone forgetting to track a model, just that the canonical reference list at the top was never updated to match. `CLAUDE.md` itself says "there is only one source of truth for what's tracked" (the code array) — this finding is just flagging that the doc's own quick-reference list contradicts that stated principle by being out of sync with it. Included in the local-AI task list (task 16) since it's a pure text edit with zero behavior risk.

---

## 10. Photo upload route has no role gate beyond "signed in, non-kiosk" (Low, needs confirmation not a fix)

**File:** `src/app/api/animals/[id]/photos/route.ts`, line 9

```ts
const volunteer = await requireNonKioskVolunteer()
```

Any signed-in `VOLUNTEER`, `SHIFT_LEAD`, `ADMIN`, or `GUEST` can upload a photo (or flip which photo is primary) for **any** animal — there's no `requireRole([...])` narrowing here, unlike almost every other write in `src/app/animals/`. This may well be intentional (anyone at the barn can snap a photo), but `CLAUDE.md`'s Permissions Quick Reference table doesn't mention `AnimalPhoto` at all, so there's no documented decision either way to confirm this against. Flagging for a decision, not treating as a bug — if it's intentional, a one-line addition to the Permissions Quick Reference table would close the ambiguity for the next person reading `CLAUDE.md`.

---

## Things checked and found correctly handled (not bugs — noted so they aren't re-litigated)

- `computeTiers()` (`src/lib/tier.ts`): the `requiresManualRelease` skip in the `computedEligibleTier` loop correctly keeps tenure-alone from ever reaching `BLUE`; `blueTenureMet` correctly uses the same tenure check unconditionally (needed to gate `releaseBlue`). No bug.
- `isEligibleForEvent()`'s AND-semantics for `requiredTagId`+`requiredTier` is a documented interpretation call, already flagged in `HANDOFF.md` — not re-flagged here.
- `createPlacement`'s deliberate lack of a `$transaction` around the multi-animal co-adoption loop is an explicit, documented design decision (partial writes are an acceptable "keep going" state) — not a bug.
- `releaseBlue`'s "blocked outright, not allowed-with-a-flag" behavior when tenure isn't met is confirmed intentional per `CLAUDE.md`.
- `getExpectedFacilityTasks`/`getRecurringTasksForMonth` (`src/lib/facilityTasks.ts`) both correctly use the UTC-string date convention throughout — no timezone issue here, unlike finding #7.
- The Clerk webhook's `findUnique({ where: { clerkId: id } })` calls in `user.updated`/`user.deleted` are safe because `clerkId` is `@unique` — no ambiguity risk there.
- `withChangeLog`'s `update` hook correctly fetches `before` via the **base** (unwrapped) client, avoiding any risk of infinite hook recursion.

---

## Summary of what's in the local-AI task list vs. held back for a human decision

**Included in `SUMMARY-LOCAL-AI.md`** (mechanical, low-risk, fully specified): the `Shift`-creation ChangeLog fix (#2, 7 tasks), the auth-ordering fix for the two roster/report actions (#5, 2 tasks), the 5 missing-`orderBy` fixes (#4, 5 tasks), the `postChatMessage` conditional revalidate (#8, 1 task), and the `CLAUDE.md` doc sync (#9, 1 task). 16 tasks total.

**Held back for you to decide, not handed to the local model:**
- #1 (`Volunteer.status` not enforced) — needs a product decision on behavior (what happens to an inactive volunteer mid-session, how it interacts with `GUEST`'s time-boxed access, whether a new admin action is needed).
- #3 (webhook re-link doesn't restore ACTIVE) — best fixed together with #1, not independently.
- #6 (event signup race) — needs an architectural choice (transaction vs. DB constraint), not a line-level fix.
- #7 (timezone parsing) — the "correct" fix changes what an absolute timestamp means for a typed-in time, which is a real behavior decision, not a no-op refactor.
- #10 (photo upload role gate) — needs you to decide what the intended permission actually is before anything gets changed.
