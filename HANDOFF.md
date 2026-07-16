# HANDOFF.md — Session Log & Continuity Notes

Horse Haven of Tennessee Ops Platform. This document is for picking the project back up cleanly — either you (James) starting a new session, or a future Claude instance getting oriented fast. It's a narrative/status log, not architecture — for *why* the schema looks the way it does, read `CONTEXT.md`. For coding conventions and version-specific traps, read `CLAUDE.md`. This file is "what actually happened and what state things are in."

Last updated: July 16, 2026, end of the first build session (schema design through four working feature slices).

## Current State, in One Paragraph

The repo is scaffolded, connected to a real Neon database, real Clerk auth, and a real R2 bucket — none of this is theoretical, all of it has been exercised end to end with real data. Four Phase 1 slices are built and verified working: authentication (Clerk → webhook → `Volunteer` row → role-based access), check-in (volunteers logging shifts), horse core records with photo upload, and feeding (baseline + daily override). Nothing is deployed yet — this has all been run and tested via `npm run dev` locally, tunneled through ngrok only for the Clerk webhook. Not yet on Vercel.

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
src/app/horses/HorseFormFields.tsx            — shared create/edit field set
src/app/horses/[id]/edit/page.tsx
src/app/horses/[id]/feeding-actions.ts
src/app/horses/[id]/page.tsx                  — detail page: core fields, photos, feeding
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

Real data exists from testing, not just seed data: your own `Volunteer` row (role `ADMIN`, tier `GREEN`), at least one test `Horse` with uploaded photos, at least one `CheckIn`, at least one `FeedingBaseline` + `FeedingOverride`, and a substantial `ChangeLog` history from all of the above (every create/update on a tracked model logs field-by-field, so the row count there is much higher than it looks at first glance — that's expected, see `CLAUDE.md`).

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

## What's Next

Per `CONTEXT.md`'s Phase 1 priority order, in the order that makes sense to keep building:

1. **Medication tracking** (`MedicationRegimen` + `MedicationLog`) — same standing-plan-plus-daily-log shape as feeding, should move faster than feeding did since the pattern's now proven twice (baseline/override → regimen/log is nearly the same code shape).
2. **Care/health tracking** (`CareEntry`, `CareType`, `HealthIssue`) — broader than medication, covers routine/seasonal care (fly masks, blanket changes, grooming) alongside medical entries, plus grouping repeat checks on an ongoing issue (a wound being monitored over several visits).
3. **Metrics** (`HorseMetric`, `WeightEntry`) — Henneke Body Condition Score and height tracking. Lower complexity than the above, mostly a log-entry form.
4. **Field/Pasture assignment** (`PastureAssignment`) — moving horses between fields. The interactive drone-photo map itself is still Phase 2 (no photo/map exists to build it against yet), but the assignment tracking and a plain list view are Phase 1.
5. Eventually: the cross-entity daily dashboard view (one row per horse showing feed/meds/care/notes at a glance) that `CONTEXT.md` §8 describes — makes the most sense once medication and care exist alongside feeding, so there's actually three things to show per row instead of one.

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
