# Horse Haven of Tennessee — Internal Ops Platform — CONTEXT.md

Prepared by James Myers. Baseline: `horse-haven-ops-platform-spec.docx` (July 13, 2026), refined against `2026_Volunteer_Manual.pdf`, `Big_Move.pdf`, and the field map, through a full grill-with-docs schema session.

This document is the source of truth for *why* the schema looks the way it does. Read it before adding a new table or changing an existing one — most "obvious" alternate designs were already considered and rejected for a specific reason, noted inline.

## 1. Scope for This Build

Live subdomain (ops.horsehaventn.org), separate codebase from the Firespring-built public site, no access needed to their system. Phase 1 focus, in priority order:

- Volunteer sign-in/sign-out + volunteer tracking (credentials, tier)
- Horse tracking (core record, photos, weight, care, medication)
- Field assignment — schema-ready for an interactive map, but the actual clickable drone-photo map UI is Phase 2. V1 ships a plain field list.
- Feed/care tracking with room to grow into whatever they want to track next

100% free-tier stack. No paid services in Phase 1. Backups are self-managed (nightly GitHub Actions cron), not a paid Neon tier.

## 2. Stack

| Layer | Choice |
| --- | --- |
| Framework | Next.js (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Database | Postgres (Neon) + Prisma |
| Auth | Clerk — authentication only, not authorization |
| File storage | Cloudflare R2 (photos, future credential scans) |
| Realtime chat | Pusher (Sandbox tier) |
| Email | Resend (credential/training expiration reminders) |
| Testing | Vitest (API/DB tests, against a real throwaway Postgres) + Playwright (E2E, real Clerk sign-in) |
| Hosting / CI | Vercel + GitHub Actions |
| Backups | Nightly `pg_dump` via GitHub Actions cron, pushed to R2. Same cron pattern also pings Neon to prevent the free-tier 7-day inactivity pause. |

## 3. Global Schema Conventions

- **IDs:** `cuid()` everywhere, matching prior projects (Shenny, testLens).
- **No hard deletes on business entities** (Horse, Volunteer). Status-driven instead — horses get adopted and returned, volunteers leave and come back. Pure lookup tables (`FeedType`, `CareType`, etc.) can hard-delete since nothing legally hinges on them.
- **camelCase throughout, no `@map`/`@@map` to snake_case.** Solo/small-team project — the mapping boilerplate buys nothing here.
- **Enums vs. lookup tables:** hard enums only for things fixed by real-world logic (`Role`, `ShiftType`, `HandlingColor`, `HorseSex`). Everything staff might want to grow themselves without a code change is an admin-managed lookup table (`FeedType`, `CredentialType`, `CareType`, `WorkType`, `MetricType`, `Field`).
- **Decimal, not Float or Int,** for anything measured in fractions (feed scoops, metrics) — avoids floating-point rounding surprises.

## 4. ChangeLog — the Core Legal-Defensibility Mechanism

This is the direct fix for the old spreadsheet-overwrite problem and the backbone of §11 (legal record-keeping for horses in active custody cases).

- **Field-level diffs**, not whole-record JSON snapshots — `field / oldValue / newValue`, not `before / after` blobs. This is a deliberate departure from the pattern used in Shenny's `AuditLog`: Shenny's audit log is a technical safety net, this one has to read cleanly enough to hand to an attorney (Case File Export, Phase 2).
- **Auto-captured, not manually logged.** A Prisma Client Extension wraps `create`/`update` on every tracked model and writes the diff itself — no route handler ever has to remember to call it. This is the whole point: if logging depended on every future feature remembering to add it, it would eventually get missed exactly where it matters most.
- **Logs CREATE as well as UPDATE.** A horse's intake record or first weight entry is itself part of the trail, not just later edits.
- **Append-only.** Corrections are new entries, not edits to old rows.
- **Visibility:** Admin sees everything. Regular volunteers only see ChangeLog entries tied to their own personal record (credentials, tier changes), not org-wide history. Shift Lead visibility into ChangeLog beyond their own record is still an open UI-permission call — not blocking for schema, worth deciding before building the ChangeLog viewer.

## 5. Auth & Permissions

Clerk handles **who someone is**. The database (`Volunteer.role`) handles **what they can do** — kept in the DB rather than Clerk metadata since every permission check already joins against `Volunteer` for other data anyway.

**Roles:** `ADMIN | SHIFT_LEAD | VOLUNTEER | GUEST`

- **ADMIN** (3–5 people): full CRUD everywhere, including `FeedingBaseline`, `Volunteer` records/credentials/roles, `PastureAssignment`, `Horse` core edits.
- **SHIFT_LEAD**: writes `CareEntry`, `FeedingOverride`, and `CheckIn` records for their shift. Cannot touch `FeedingBaseline`, `Volunteer` records, `PastureAssignment`, or `Horse` core fields — those stay Admin-only. Has **read access to all shifts/check-ins org-wide**, not scoped to their own `RegularShiftAssignment` — overlap is normal (filling in, covering, multiple leads seeing the same volunteer).
- **VOLUNTEER**: checks in/out, logs own hours, reads what's needed for a shift (feeding, pasture info).
- **GUEST**: folded into `Volunteer` (`role: GUEST` + nullable `accessValidFrom`/`accessValidUntil`) rather than a separate `GuestAccess` entity — this is a loosely-planned, likely-later feature (vets, non-volunteer visitors), not worth standing up a second auth path for until it's actually needed.

`Volunteer.clerkId` is nullable — most volunteers do have logins (they view documents, sign acknowledgments, check in/out themselves), but a record can exist purely as tracked data entered by an admin with no login attached.

New Clerk signups default to `VOLUNTEER`. No self-service promotion path, ever. The first Admin(s) are set directly via a one-time seed script.

## 6. Volunteer Tier — the Handling Color System

`HandlingColor` (`GREEN | ORANGE | YELLOW | BLUE | RED`) is a **shared enum** used two ways:

- `Volunteer.tier` — a barn-earned clearance level, separate from `role` (app permissions). A volunteer can be `role: VOLUNTEER` and `tier: BLUE` at the same time.
- `Horse.requiredHandlerColor` — what level of volunteer the horse needs. `RED` covers both "shift-lead only" and "Brandon only" horses — the shift lead is expected to know which is which in person, so the schema doesn't try to distinguish a role-based restriction from a named-individual one.

**Progression:** Green → Orange → Yellow is tenure-based (exact timelines TBD — approximate is "a few months," "a year," "another year," pending the real written schedule). Blue requires tenure **plus** passing Brandon's in-person Blue Handler Class, tracked as a `CredentialRecord` row the same way vaccinations are. Tier changes are manual (admin/Brandon flips the field), logged automatically via ChangeLog — no auto-computation from hire date.

**V1 is informational only.** The app displays tier next to a volunteer's name so shift leads can match people to horses; it does not enforce anything. Enforcing `volunteer.tier >= horse.requiredHandlerColor` is a clean Phase 2 feature once the base data exists.

`Horse.handlingNotes` (free text) should get a soft UI warning — not a DB constraint — if `requiredHandlerColor: RED` is set with no notes filled in.

## 7. Volunteer / Credentials

`Volunteer` core fields: name, email, phone, emergency contact, role, status, tier, hireDate. No address field — nothing in the spec calls for one.

`CredentialRecord` covers vaccinations **and** training acknowledgments (manual read-and-confirm, Blue Handler Class) under one mechanism — same lookup-table pattern, different `CredentialType` rows. **No upload, no admin verification workflow** — confirmed they only capture dates/info, not documents. `fileRef` stays in the schema (unused for now, cheap to leave) in case that changes. `score` is nullable and unused today, added ahead of time for the possible future "easy test" version of the manual read-confirmation.

**Expiration notifications:** volunteer gets notified at 30/60/90 days out for mandated training specifically (vaccination reminders may not be needed — that's collected mostly for legal reasons, not active tracking). Admins get a weekly digest of anything org-wide expiring/expired rather than per-person emails, so it's not a burden to use. Sent via Resend, triggered by a scheduled GitHub Actions job (same pattern as the Neon keep-alive ping). Track `notifiedAt` to avoid double-sending the same alert.

## 8. Shift & Check-In

Two real facts from the volunteer manual shaped this:

- **"Shift cannot begin until a team lead or backup is present."**
- **"Volunteers allowed to enter as long as one other volunteer is present."**

Both are treated as **human/social rules, not app-enforced** in V1. The data to build enforcement later already exists once check-ins are logged — this is deliberately deferred complexity, not a gap.

**Regular shift assignment is a separate concept from a daily shift occurrence.** "I'm Sunday PM" is a standing roster fact (`RegularShiftAssignment`); a specific Sunday's actual PM shift is the occurrence (`Shift`, created implicitly on first check-in for that date+type). A volunteer can hold more than one regular slot. When someone's regular assignment changes, the old row is closed out (`active: false`, `endDate` set) rather than overwritten — same append-ish pattern as everything else.

**Current real-world flow:** volunteers currently sign out once at the end of a visit via a Google Form, entering both arrival and departure time retrospectively. `CheckIn` uses two nullable timestamps (`checkInAt`, `checkOutAt`) rather than two separate paired rows — both can get filled at once to match today's workflow, but the same shape supports true real-time check-in/out later (tablet, QR, PWA) without a schema change.

**`workType`** (`regular shift / filled in / barn cleanup / event / facilities / go team / grooming / training / other`) is a real field the original spec didn't have — pulled directly from what they currently track on the Google Form. Lookup table, admin-managed.

Legacy sheet migration: each row → one `CheckIn` with both timestamps set directly, `checkInMethod`/`checkOutMethod` both `LEGACY_FORM`.

## 9. Horse Core + Photos

`HorsePhoto` is a **child entity**, not fixed columns on `Horse` — deliberately not `profilePhotoUrl`/`mapPhotoUrl` as two columns, because more-than-two is the expected case (progress photos at weigh-ins, injury documentation), not an edge case. Minimum two per horse to function (full-body side shot for the field map, headshot for the profile/feed schedule display), unbounded beyond that. Optional nullable `relatedEntityType`/`relatedEntityId` lets a photo tie directly to the `WeightEntry` or `HealthIssue` it documents, same generic-link pattern used elsewhere.

**Sex/status:** `HorseSex` (`STALLION | GELDING | MARE | COLT | FILLY | RIDGLING | UNKNOWN`) — standard equine terminology. Castration itself is logged as a normal `CareEntry` (type: "Castration"), and `Horse.sex` gets manually flipped afterward, captured by ChangeLog like any other edit. There's no single common term for a spayed mare (rare procedure, no standardized vocabulary), so that's a separate `spayed` boolean rather than an enum value.

**Adoption/return:** `Horse.status` is fast-filterable current state. `Placement` is the real entity behind it — adopter info, placement date, return date, and `nextFollowUpDate`/`followUpCadence` to actually drive scheduled reminder emails. Status alone can't drive a follow-up job; `Placement` can.

## 10. Field / Pasture

Confirmed from the field map and manual:

- Codes: `L1`–`L6` (with `L4A`/`L4B` as subfields of `L4`), `RP1`–`RP6`.
- **Turnout and bring-in are different sequences, not reverses of each other:** Turnout `L6→L5→L4→(walk through L3)→L1→L2→RP1–RP6→L3 last`. Bring-in `L3→L4→L5→L6→RP6–RP1→L2→L1`. `Field` carries both `turnoutOrder` and `bringInOrder`.
- Non-horse facility markers (Parking, Shavings, Manure, Bucket Wash, Entrance/Exit) are **not DB-backed** — static annotations added directly to the map UI whenever it's built, not pasture data.
- `Field.boundaryPoints` stores **pixel-percentage coordinates relative to the drone photo** (not lat/lng) — the map only ever needs to answer "where does this zone sit on this specific image." Schema is ready now; nothing renders until an actual drone photo exists to anchor it to.

**Pasture moves happen often** ("musical horses") — one active `PastureAssignment` per horse, enforced app-side (close the old row, open a new one) rather than a DB exclusion constraint, since the moves need to be fast and simple, not fighting Postgres range-overlap constraints. Admin-only action. Who moved a horse is captured by ChangeLog, not a dedicated field on the row — regular volunteers won't be viewing org-wide history anyway, and it would've been redundant with what ChangeLog already gives Admins.

## 11. Feeding

Real feed items confirmed: Senior, Strategy, a mini-specific feed (name TBD), Alfalfa, plus non-hay grass feeds — all measured in **scoops**, in quarter-scoop increments (¼ through 1¾+). Hay is measured in **flakes**. Omega-3 oil is a **squirt**-based supplement given to specific horses. `FeedType.category` (`MAIN_FEED | HAY | SUPPLEMENT | ADDITIVE`) separates these cleanly; `ADDITIVE` is also the home for anything unusual that shows up later (Guinness stays a note on the row rather than its own `FeedType` — rare enough that structured tracking isn't worth it, unlike omega-3 which has an ongoing health rationale).

A horse can have **multiple `FeedingBaseline` rows per shift** — one per feed item, not one crammed row per horse per shift. Amounts change slowly over time as weight goes up or down, tracked as new baseline edits (captured by ChangeLog).

`requiresSoaking` defaults `true` on every `FeedingBaseline` row — most intakes are neglect/abuse cases and soaking is standard practice for easier digestion. Specific exceptions (Remus the mini) flip it to `false` at the row level rather than a `Horse`-level flag, since soaking could in theory vary per feed item even for the same horse.

Medication mixed into feed is **not** part of `FeedingBaseline` — it's rare, and it belongs on the medical side (`MedicationRegimen`) even when the administration happens to be "mixed in with the PM grain." `MedicationRegimen.route` is free text for exactly this.

## 12. Medication & Care

`MedicationRegimen` (standing plan: drug, dose, frequency, route) + `MedicationLog` (daily confirmation it was actually given) mirrors the feeding baseline/log pattern — this matches how staff described tracking ongoing meds, same rhythm as the daily feed chart.

`CareEntry`/`CareType` is deliberately **broader than "medical"** — it was originally going to be `MedicalTreatment` per the spec, but that name doesn't fit fly masks, blanket changes, or grooming, which are routine seasonal care, not medical events. One entity, `CareType.category` (`MEDICAL | SEASONAL | GROOMING | OTHER`) filters it back down when needed (e.g., a vet or a legal export only wants the medical subset).

`HealthIssue` groups repeat checks on an ongoing condition (a wound being monitored over several visits, a respiratory issue being watched) so the full timeline is one query instead of reading through loose notes. `CareEntry.relatedHealthIssueId` is nullable — most entries aren't tied to an ongoing issue.

`RecurringCareSchedule` exists for the few things that genuinely run on a calendar (if any turn out to), but `cadenceDays`/`nextDueDate` are fully optional — most farrier/vet activity at a rescue is reactive (bad hooves, urgent calls), not clock-driven, and forcing it through a schedule model would misrepresent how the work actually happens.

## 13. Metrics & Weight

`WeightEntry` stays its own dedicated table (explicit in the original spec, directly tied to photos via `HorsePhoto.relatedEntityId`) rather than folding into the generic metric table — it's the timeline of record, other things reference it. `WeightEntry.context` (`ROUTINE | ASSESSMENT`) distinguishes a regular weigh-in from an ad hoc vet assessment.

`HorseMetric` (generic: `metricTypeId`, `value`, `date`) is the one deliberately generic pattern in this schema, built now even though nothing populates it yet. It covers:

- **Height**, in hands — stored exactly as entered (e.g. `15.2` for 15 hands 2 inches; this is standard notation, not true decimal math, so no conversion to total inches is needed since nothing aggregates across height values).
- **Henneke Body Condition Score**, the standard 1–9 scale (half-points valid: 4.5, 6.5) used across the rescue/rehab world to assess fat cover. Courts of law accept Henneke BCS findings as evidence in equine neglect cases — directly relevant to §11's legal record-keeping for horses in active custody proceedings, not just a general health metric.

New measurement types later are a new `MetricType` lookup row, not a new table.

## 14. Everything Else Unchanged From the Original Spec

`DonationInKind`, `ChatChannel`/`ChatMessage` (three channel types: admin/shift-leader, per-shift AM/PM, one-way broadcast) carry through largely as originally specified. Donations stay free-text on `item` — too varied to meaningfully categorize, and nothing needs to report on exact donation type.

## 15. Phase 1 vs. Phase 2

**Phase 1 (this build):** everything above except what's listed below. Full historical data migration from the Google Sheets still needs representative sample sheets from Horse Haven to scope accurately (§13 of original spec — this hasn't been resolved by this session, still an action item).

**Phase 2 / later:**
- Interactive drone-photo map UI (schema is ready now)
- Real usage of `RecurringCareSchedule` and `GuestAccess`-style access, if either turns out to be needed
- Tier-based handling enforcement (`volunteer.tier >= horse.requiredHandlerColor`)
- Native mobile check-in app (true background/geofenced check-in)
- AI assistant in chat (Clarity-style, same pattern as Shenny)
- Public donate flow (if Lori wants it — public site's existing flow may just stay as-is)
- Case File Export report generation (data is already being captured via ChangeLog regardless of when the export UI gets built — pull into Phase 1 if a legal need becomes active/urgent)

## 16. Open Items Still Owed to Lori/Ashley

Carried over from the original spec, unresolved by this schema session because they're organizational decisions, not schema decisions:

- UTK vet/guest access: read-only only, or able to add visit notes?
- Public donate flow: in-kind ledger only, or also a new public-facing flow?
- What (if anything) do Horse Haven's attorneys formally expect for record-keeping on active custody cases?
- Exact tenure timelines for Green→Orange→Yellow (approximate only so far — need the actual written schedule)
- Backup budget: not applicable — self-managed nightly export is the committed path regardless of Lori's preference here
- Native mobile app: worth the investment long-term, or is responsive web sufficient?
- Should Shift Lead be able to open/resolve a `HealthIssue` and log `MedicationLog` entries? §5 only explicitly grants Shift Lead write access to `CareEntry`/`FeedingOverride`/`CheckIn`. When medication and care/health tracking were built, Shift Lead was given the same access to these two as an inferred extension of that pattern (shift leads are the ones present to give medication and spot new issues; admins aren't at every shift) — not a decision anyone at Horse Haven actually made. Confirm or correct; see `CLAUDE.md`'s Permissions Quick Reference for where this is encoded in code.

## 17. Barn Operational Reference (from Volunteer Manual + Field Map)

- **Turnout order:** L6 → L5 → L4 → (walk through L3 to round pens) → L1 → L2 → RP1–RP6 → L3 last
- **Bring-in order:** L3 → L4 → L5 → L6 → RP6–RP1 → L2 → L1
- Always turn out from the back of the barn. Never lead horses down the steep hill or the road.
- Field codes: L1–L6 (L4 has subfields L4A/L4B), RP1–RP6. Non-horse map markers (Parking, Shavings, Manure, Bucket Wash, Entrance/Exit) are annotations only, not tracked entities.
- Seasonal feed sequencing (workflow, not schema): summer = feed → turnout → clean; winter = clean → bring-in → feed.
- Stall cleaning: shavings in the center of the stall, not wall-to-wall; one wheelbarrow of shavings per stall (may move to two — TBD per the manual); strip stalls get chlorhexidine wash + fresh shavings. Never clean a stall with a horse inside; never tie a horse in a stall or aisle.
- Safety rule (social, not app-enforced): volunteers can't be in the barn alone; a shift can't start until a team lead or backup is present.

## 18. Terminology Update (July 2026): `Horse` → `Animal`

Everything in §9 above still describes the real reasoning behind the core entity's fields — it was written when `Horse` was a genuinely accurate name, since the rescue's daily operations really were horse-only at the time. This section records what changed and why, rather than rewriting §9's history.

The rescue's actual population includes mules, donkeys, minis, ponies, and (per James) a barn cat, Binx, who had already been entered as a `Horse` record for lack of anywhere else to put him. Rather than let that mismatch grow (a future "what if we get a donkey" moment forcing an awkward migration under time pressure), the core model was renamed `Horse` → `Animal` and a `species` enum (`HORSE | DONKEY | MULE | MINI_HORSE | PONY | CAT | OTHER`, default `HORSE`) was added. This was a dedicated rename pass — schema, migration, every server action/route under what's now `src/app/animals/`, and both the Vitest and Playwright suites — done as its own session, deliberately separate from any new feature work (V2.md Session 1's Location model work).

- **Every existing record defaulted to `HORSE`** except Binx, matched by name against the live Neon data and confirmed with James before the migration backfilled that one row to `CAT`. No other real records needed reclassifying.
- **Routes moved from `/horses` to `/animals`**, matching the model rename. **User-visible copy did not follow** — nav links, page headings, and button text still say "Horse"/"Horses" throughout the app, since that's the term staff actually use day to day (same reasoning V2.md gives for its own prose: the schema says `Animal`, the humans say "horse"). Only identifiers, file paths, and route segments changed.
- **The migration was hand-written**, not generated by `prisma migrate dev`'s auto-diff — Prisma's diff engine can't distinguish a rename from a drop-and-recreate without an interactive prompt, and running non-interactively against real production data would have destroyed the live `Horse` table (confirmed: the auto-diff attempt warned it was about to drop a non-empty table). The actual migration uses `ALTER TABLE ... RENAME TO` / `RENAME COLUMN` throughout, verified against the schema with `prisma migrate diff` afterward to confirm zero drift before it touched real data.
- **`ChangeLog` history was left alone.** Existing rows still say `entityType: "Horse"` (or `"HorseMetric"`) because that was the accurate model name at the time they were written — rewriting them would violate the append-only, legally-defensible-as-written principle from §4. Only new writes use `"Animal"`/`"AnimalMetric"`. Anything building a ChangeLog viewer or Case File Export later needs to treat `"Horse"`/`"Animal"` (and `"HorseMetric"`/`"AnimalMetric"`) as the same entity across that boundary.
- **No new feature work rode along with this rename** — no species picker was added to the create/edit form, no species column shown in the list/dashboard UI. `species` exists in the schema and is populated correctly, but surfacing it is deliberately left for whenever it's actually needed, consistent with this project's general bias against building ahead of a confirmed need.
