# HANDOFF.md — Session Log & Continuity Notes

Horse Haven of Tennessee Ops Platform. This document is for picking the project back up cleanly — either you (James) starting a new session, or a future Claude instance getting oriented fast. It's a narrative/status log, not architecture — for *why* the schema looks the way it does, read `CONTEXT.md`. For coding conventions and version-specific traps, read `CLAUDE.md`. This file is "what actually happened and what state things are in."

Last updated: July 16, 2026. First build session (schema design through four working feature slices), a same-day follow-up session that added medication and care/health tracking, and a second same-day follow-up that added metrics and field/pasture assignment.

## Current State, in One Paragraph

The repo is scaffolded, connected to a real Neon database, real Clerk auth, and a real R2 bucket — none of this is theoretical, all of it has been exercised end to end with real data. Eight Phase 1 slices are built and verified working: authentication (Clerk → webhook → `Volunteer` row → role-based access), check-in (volunteers logging shifts), horse core records with photo upload, feeding (baseline + daily override), medication (regimen + daily log), care/health (care entries + ongoing health issues), metrics (weight entries + generic Henneke BCS/height metrics), and field/pasture assignment (move a horse between fields, plus a plain fields list). Nothing is deployed yet — this has all been run and tested via `npm run dev` locally, tunneled through ngrok only for the Clerk webhook. Not yet on Vercel.

## Commit History (8 commits on `main`, all pushed)

```
81285ba Scaffold Next.js + Prisma project from grill session decisions
ee015cd Fix Neon pooled/direct connection split and stop ignoring .env.example
6dd25db Move seed command config to prisma.config.ts per Prisma 7
581aa8b Wire up Clerk webhook, sign-in UI, and first protected page
79dcb6f Add check-in feature - first real Phase 1 slice
1bc5e2c Add Horse core CRUD - second Phase 1 slice
a76e618 Add horse photo upload via R2 - third Phase 1 slice
a3c3ce7 Add feeding baseline/override - fourth Phase 1 slice
```

Read the commit messages themselves for detail — each one documents the reasoning for that slice, not just what changed.

**Workflow note for continuing this pattern:** Claude (in claude.ai, not Claude Code) has no push access to GitHub in this environment. Every commit above was built and committed locally by Claude, packaged as a `git format-patch` file, downloaded, and applied via `git am <patch>` — which applies *and commits* in one step, preserving the original message. If a new chat session continues this way, expect the same pattern: Claude builds and commits in its own sandbox, hands over a `.patch` file, you `git am` it and `git push`. If you're instead using Claude Code directly against this repo, it should have real push access and this whole dance is unnecessary — just let it commit and push directly.

## File Tree (everything under `src/` and `prisma/`, as of the last commit)

```
prisma/schema.prisma
prisma/seed.ts
src/app/admin/page.tsx                        — diagnostic "am I admin" page, not a real feature
src/app/api/horses/[id]/photos/route.ts       — photo upload Route Handler
src/app/api/webhooks/clerk/route.ts           — Clerk user lifecycle webhook
src/app/checkin/actions.ts
src/app/checkin/page.tsx
src/app/fields/page.tsx                       — plain fields list (V1 in place of Phase 2 map), read-only
src/app/horses/HorseFormFields.tsx            — shared create/edit field set
src/app/horses/[id]/care-actions.ts            — createCareEntry/createHealthIssue/resolveHealthIssue
src/app/horses/[id]/edit/page.tsx
src/app/horses/[id]/feeding-actions.ts
src/app/horses/[id]/medication-actions.ts     — createMedicationRegimen/endMedicationRegimen/logMedicationAdministered
src/app/horses/[id]/metrics-actions.ts        — createWeightEntry/createHorseMetric
src/app/horses/[id]/page.tsx                  — detail page: core fields, photos, feeding, medication, care/health, metrics, field/pasture
src/app/horses/[id]/pasture-actions.ts        — assignPasture
src/app/horses/actions.ts                     — createHorse/updateHorse
src/app/horses/new/page.tsx
src/app/horses/page.tsx                       — list, defaults to ACTIVE only
src/app/layout.tsx                            — ClerkProvider wrapper
src/app/page.tsx                              — homepage, sign-in + nav links
src/lib/auth.ts                               — getCurrentVolunteer/requireVolunteer/requireRole
src/lib/prisma.ts                             — Prisma client + withChangeLog extension
src/lib/r2.ts                                 — R2 S3-compatible client
src/proxy.ts                                  — Clerk middleware (Next 16 naming)
```

## What's Actually Live in Neon Right Now

Real data exists from testing, not just seed data: your own `Volunteer` row (role `ADMIN`, tier `GREEN`), at least one test `Horse` with uploaded photos, at least one `CheckIn`, at least one `FeedingBaseline` + `FeedingOverride`, and a substantial `ChangeLog` history from all of the above (every create/update on a tracked model logs field-by-field, so the row count there is much higher than it looks at first glance — that's expected, see `CLAUDE.md`). Medication and care/health writes were verified against this same live DB with a throwaway script (create → read the exact page.tsx query shapes → update → hard-delete the test rows via raw Prisma, bypassing `withChangeLog` on purpose so no test noise landed in `ChangeLog`) — no leftover test data, real `Horse`/`Volunteer` rows untouched.

Seeded lookup tables (via `npm run db:seed`, already run): `CredentialType`, `FeedType`, `CareType`, `WorkType`, `MetricType`, `Field` (all 14 field codes from the map).

## External Services — Setup Status

| Service | Status | Notes |
| --- | --- | --- |
| **Neon** | Live, migrated, seeded | Project connected via both pooled (`DATABASE_URL`) and direct (`DIRECT_URL`) connection strings. Compute scales to zero after inactivity — expect the first query/migration after a gap to fail once and succeed on retry (`P1017: Server has closed the connection`). This happened three separate times tonight (twice on `migrate dev`, once opening Prisma Studio) and a plain retry fixed it every time. Not a bug, just how Neon's free tier behaves. |
| **Clerk** | Live, dev instance | App named `volunteer-ops`, separate from Shenny/testLens. Webhook endpoint configured for `user.created`/`user.updated`/`user.deleted`, currently pointed at an **ngrok tunnel URL, which changes every time ngrok restarts.** Starting a new session that needs webhook testing (new signups, not just using an already-linked account) means: start ngrok fresh, copy the new forwarding URL, go to Clerk dashboard → Webhooks → your existing endpoint → update the URL to match. The signing secret does NOT change when you update the URL on an existing endpoint — only if you delete and recreate the endpoint. Using Clerk with development keys — production keys are a separate, later step (Clerk will nag about this, it's expected at this stage). |
| **Cloudflare R2** | Live | Bucket `volunteer-ops`. Public Development URL enabled (the `pub-xxxx.r2.dev` domain) — **Cloudflare's own docs say this is rate-limited and dev-only; a custom domain is the recommended production path.** Not urgent, but on the list before real deployment. API token: Account API token, Object Read & Write, scoped to this bucket specifically (not Admin, not account-wide — least privilege, deliberate). |
| **GitHub Actions secrets** | **Not configured yet** | `.github/workflows/ci.yml` and `nightly-backup.yml` both reference repo secrets (`DATABASE_URL`, `DIRECT_URL`, R2 creds, Clerk keys) that don't exist in the repo's Settings → Secrets yet. Both workflows currently sit red/failing in the Actions tab. Not blocking local development, but worth doing before relying on either CI or the automated backup. |
| **Vercel** | Not set up | This project has only ever run via `npm run dev`. No deployment yet. |

## Real Bugs Found Tonight (read before touching related code)

This stack runs newer package versions than typical AI training data assumes, and several genuine version-specific traps got caught *before* they became silent failures, by verifying against current docs rather than assuming. Full detail on each is in `CLAUDE.md`; short version here for orientation:

- **Prisma 7** removed `$use` middleware (Client Extensions are the only hook mechanism now — this is what `withChangeLog` relies on), changed the generator provider name and requires an explicit `output` path, requires a driver adapter passed to `PrismaClient`'s constructor, moved connection config to `prisma.config.ts`, and moved the seed command from `package.json` into `prisma.config.ts`'s `migrations.seed` field. Every one of these was a real error message hit and fixed during setup, not a precaution.
- **Neon + Prisma 7** needs two separate connection strings (pooled for the app, direct/unpooled for migrations and the seed script) — collapsing them back into one breaks migrations via PgBouncer's transaction-pooling mode.
- **Next.js 16** renamed `middleware.ts` to `proxy.ts`, made `params`/`searchParams`/`cookies()` all return Promises, and — this one's still an open risk, not fully resolved — May 2026's security patch (fixing a real DoS CVE) introduced a regression where Server Actions using `useActionState` can receive empty `FormData`. Mitigation in place: every form in this app uses a plain `<form action={...}>` without `useActionState`. This worked fine in testing tonight, but it's not a guarantee the underlying issue is fully absent from our exact patch version — if a future form's submitted values come back empty/null unexpectedly, this is the first thing to suspect.
- **Server Actions cap request bodies at 1MB by default**, and the documented workaround (`bodySizeLimit` in `next.config.ts`) has a long, messy history of not reliably working across versions and hosts. This is *why* photo upload was built as a Route Handler with a plain multipart form instead of a Server Action — sidesteps the whole problem, and it's current official guidance, not a workaround of our own invention.
- **Clerk v7**: `auth()` is async and returns `isAuthenticated` explicitly (don't trust bare `userId` truthiness), and `SignedIn`/`SignedOut` don't exist anymore — replaced by a single `<Show when="signed-in">` component.
- **R2 has two different token systems** that both mention R2 permissions, and only one of them actually produces usable S3-compatible credentials. The general Cloudflare API Token builder (My Profile → API Tokens → Custom Token, "Workers R2 Storage" permission group) gives you a token value that is **not** directly usable as an S3 secret key — it needs to be SHA-256 hashed first, which that flow doesn't do for you. The dedicated R2 → Manage R2 API Tokens flow gives you a ready-to-use Access Key ID/Secret Access Key pair directly. This cost real debugging time tonight (`403 AccessDenied` with correct-looking permissions) before the root cause was found.

## Known Gaps / Deferred Items

- **`prisma/seed.ts`'s RP1–RP6 turnout/bring-in order is a guess.** The volunteer manual lists them as one block (`RP1–RP6`) without individual ordering; all six currently share the same order value. Fix once the real per-field walking order is known.
- **SSL deprecation warning** on every DB connection (`sslmode=require` being treated as an alias for `verify-full`, which will stop being true in a future major version of the `pg` driver). Harmless today, worth tightening to `sslmode=verify-full` explicitly before production.
- **Volunteer tier tenure timelines are approximate** (Green→Orange→Yellow "a few months / a year / another year") — get the real written schedule from Horse Haven before this becomes anything more than informational display.
- **R2's Public Development URL** should become a real custom domain before this goes live for actual volunteer use — see the Cloudflare R2 row above.
- **No Case File Export yet** — the legal-defensibility data (ChangeLog, append-only patterns) is all being captured correctly as features get built, but the actual export report UI is still a Phase 2 item per `CONTEXT.md` §15, pull forward if a real legal need becomes active.

## Medication + Care/Health Tracking — Built This Session

Both slices landed the same way feeding did: no schema changes needed (`MedicationRegimen`/`MedicationLog` and `CareEntry`/`CareType`/`HealthIssue` were already fully modeled in `prisma/schema.prisma` from the original grill session), just new Server Actions plus two new sections on `src/app/horses/[id]/page.tsx`.

- **Medication** (`src/app/horses/[id]/medication-actions.ts`): `createMedicationRegimen` is Admin-only, mirroring `FeedingBaseline`. `logMedicationAdministered` is Admin or Shift Lead, mirroring `FeedingOverride` — one log row per regimen per day, given/missed with notes. Added `endMedicationRegimen` (Admin-only, sets `endDate`) since, unlike `FeedingBaseline`, `MedicationRegimen` actually has an end date and regimens do run out — the horse detail page only lists regimens with no `endDate` or `endDate >= today`.
- **Care/Health** (`src/app/horses/[id]/care-actions.ts`): `createCareEntry` is Admin or Shift Lead — this one's explicit in `CLAUDE.md`'s permission table already. `createHealthIssue`/`resolveHealthIssue` aren't in that table (only `CareEntry`/`FeedingOverride`/`CheckIn` are listed for Shift Lead), so this was a judgment call: gave Shift Lead the same access as `CareEntry` itself, on the reasoning that opening/closing a health issue is just bookkeeping around the care entries they're already trusted to log, not a new category of authority. Flagging this so it can be corrected if that's wrong — worth a real answer from Lori/Ashley the way the other open items in `CONTEXT.md` §16 are tracked.
- **Fixed a `trackedModels` gap while in there:** `MedicationLog` wasn't in `src/lib/prisma.ts`'s `trackedModels` array even though it's the exact same "daily log entry" shape as `FeedingOverride`, which is tracked. `MedicationRegimen`, `CareEntry`, and `HealthIssue` were already in the array from the original schema session (pre-added, unused until now) — `MedicationLog` looks like it was just missed at the time, not a deliberate exclusion (there's no `CONTEXT.md`/`CLAUDE.md` reasoning for excluding it the way there is for `HorsePhoto`). Added it. `CareType` stays untracked, correctly — it's a lookup table like `FeedType`, not a data entity.
- Verified directly against the live Neon DB (see above) rather than through the browser — no `chromium-cli` or equivalent browser automation tool was available in this environment, and driving a real Clerk sign-in headlessly wasn't practical. `npx tsc --noEmit` and `npm run lint` both pass clean (matching what CI actually checks — there's no `next build` step in `.github/workflows/ci.yml`). **Still worth a manual click-through in a real browser before trusting this fully** — the query logic and write paths are verified, but the actual rendered UI (form layout, the "End regimen" link sitting inside the same table cell, etc.) has not been visually confirmed.
- No E2E coverage added, consistent with feeding (which also shipped without Playwright coverage) — `tests/e2e/` still only has the placeholder smoke test, and there's no Clerk-authenticated test fixture yet for any protected page. Worth setting up before this drifts further from `CLAUDE.md`'s stated testing priorities.

## Metrics + Field/Pasture Assignment — Built This Session

Same pattern as medication/care/health before it: no schema changes needed (`HorseMetric`/`WeightEntry`/`MetricType` and `Field`/`PastureAssignment` were already fully modeled from the original grill session, and `MetricType` + all 14 `Field` rows were already seeded), just new Server Actions plus two new sections on `src/app/horses/[id]/page.tsx`, plus one new top-level page.

- **Metrics** (`src/app/horses/[id]/metrics-actions.ts`): `createWeightEntry` and `createHorseMetric`, both Admin or Shift Lead. This permission split wasn't specified anywhere (`CLAUDE.md`'s permission table didn't cover `WeightEntry`/`HorseMetric` at all) — asked James directly this session rather than inferring it the way `MedicationLog`/`HealthIssue` access was inferred last session; he confirmed Admin-or-Shift-Lead, reasoning it the same way as `CareEntry` (a routine observation logged during a shift, e.g. at a weigh-in). Recorded in `CLAUDE.md`'s Permissions Quick Reference as a settled decision, not an open item. The horse detail page shows the last 10 `WeightEntry` rows and last 10 `HorseMetric` rows (joined to `MetricType` for name/unit) as two separate lists side by side — kept separate in the UI because they're deliberately separate tables in the schema (`CONTEXT.md` §13: `WeightEntry` is the timeline of record other things reference; `HorseMetric` is the generic bucket everything else, including Henneke BCS and height, grows into via new `MetricType` rows).
- **Field/Pasture** (`src/app/horses/[id]/pasture-actions.ts`): `assignPasture`, Admin-only per `CONTEXT.md` §10 (not a judgment call — explicit in the design doc already). Closes the horse's current active `PastureAssignment` (sets `endDate` to today) if one exists, then creates the new row — two sequential awaits, deliberately no `$transaction`, matching §10's explicit reasoning that this needs to stay fast/simple rather than fight Postgres range constraints. The horse detail page's new "Field / Pasture" section shows the current field, a short history, and the move form (Admin-only; everyone else just sees current + history read-only).
- **New `src/app/fields/page.tsx`**: the plain field list V1 calls for (`CONTEXT.md` §1/§10) standing in for the Phase 2 interactive drone-photo map. Read-only for any signed-in volunteer — lists all active fields with turnout/bring-in order and whichever horse(s) currently have an open assignment there. A field can hold more than one horse at once (it's a per-horse exclusivity rule, not a per-field one), so this renders as a list per row, not a single name. Linked from the homepage nav. Moving a horse still only happens from that horse's own detail page, kept as a single action location rather than duplicating the move form here too (asked James, he confirmed detail-page-only).
- Verified directly against the live Neon DB with a throwaway script (same style as the medication/care session): created a real `WeightEntry` + `HorseMetric`, read them back through the exact query shapes `page.tsx` uses, exercised the close-old/open-new `PastureAssignment` sequence including the fields-list join, then cleaned up via raw Prisma deletes/restores bypassing `withChangeLog` so no test noise landed in `ChangeLog` and the horse's real prior pasture assignment was restored exactly. `npx tsc --noEmit` and `npm run lint` both pass clean. **Still worth a manual click-through in a real browser before trusting the UI fully** — same caveat as last session, the actual rendered layout hasn't been visually confirmed.
- `trackedModels` in `src/lib/prisma.ts` already had `WeightEntry`, `HorseMetric`, and `PastureAssignment` from the original schema session — no gap to fix this time, unlike the `MedicationLog` miss found last session.

## What's Next

Per `CONTEXT.md`'s Phase 1 priority order:

1. The cross-entity daily dashboard view (one row per horse showing feed/meds/care/metrics/pasture at a glance) that `CONTEXT.md` §8 describes — now unblocked, since feeding, medication, care, metrics, and pasture all exist.
2. A Clerk-authenticated Playwright fixture, so E2E coverage can actually start landing per `CLAUDE.md`'s testing priorities instead of continuing to defer. `CLAUDE.md`'s Testing section specifically calls out pasture reassignment as one of the flows to cover early — now buildable.
3. GitHub Actions secrets still aren't configured (see the table above) — both workflows sit red/failing. Not blocking local dev, but needed before CI/nightly backup actually run.

## Quick-Start Checklist for a New Session

```
git pull
npm install
npm run dev
```

If you need to test anything involving new Clerk signups or webhook-dependent flows (not needed for most day-to-day feature work — only matters if the feature itself touches user creation):
```
ngrok http 3000
```
then update the endpoint URL (not create a new endpoint) in Clerk's dashboard to match the new ngrok URL.

If `npm run db:migrate`, `npm run db:seed`, or opening Prisma Studio fails on the first try with a connection error — that's almost certainly the Neon cold-start pattern, not a real problem. Just try again.
