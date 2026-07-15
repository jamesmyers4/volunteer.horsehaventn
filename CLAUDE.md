# CLAUDE.md — Horse Haven of Tennessee Ops Platform

## This Repo Runs Newer Package Versions Than Training Data Usually Covers

Confirmed while scaffolding (July 2026): **Next.js 16.2.10, React 19.2.4, Prisma 7.8.0, @clerk/nextjs ^7.5.18.** Each of these has real breaking changes from the conventions an AI coding assistant is likely to default to from memory. Specific traps already hit once, don't repeat them:

- **Next.js 16:** the middleware file is `src/proxy.ts`, not `src/middleware.ts` (that name is Next.js ≤15 only). Before writing any App Router code, check `node_modules/next/dist/docs/` for this version's actual conventions — a warning to this effect is also in `AGENTS.md` at the repo root, which this file intentionally duplicates since not every tool reads both.
- **Prisma 7:** middleware (`$use`) is gone entirely — Client Extensions (`$extends`) are the only way to hook queries, which is what the ChangeLog mechanism in `src/lib/prisma.ts` relies on. The generator provider is `prisma-client` (not `prisma-client-js`), requires an explicit `output` path, and `PrismaClient` now requires a driver adapter passed to its constructor (`@prisma/adapter-pg` here) — `new PrismaClient()` with no arguments throws. Connection config lives in `prisma.config.ts`, not inline in the schema's `datasource` block. **The seed command also moved** — it's `migrations.seed` inside `prisma.config.ts`, not the `"prisma": {"seed": ...}` block in `package.json` (that field is silently ignored now; don't be fooled into thinking it still does anything). The project's `package.json` has `"type": "module"` because of this whole ESM shift. **Neon specifically needs two separate connection strings** — `DATABASE_URL` (pooled, has `-pooler` in the hostname, used by the app at runtime via the adapter) and `DIRECT_URL` (unpooled, used by `prisma.config.ts` for migrations and by `prisma/seed.ts`). PgBouncer's transaction-pooling mode breaks schema migrations and can cause issues with multi-statement seed scripts, so don't collapse these back into one variable.
- **Watch for a Turbopack + Prisma 7 module resolution error** (`Cannot find module '.prisma/client/default'`) during `npm run dev`. One source describes this as a real conflict between the `prisma-client` generator provider and Next 16's Turbopack dev server, fixable by reverting to `prisma-client-js` with no `output` path plus a `next.config.ts` adjustment. This wasn't reproducible in the sandbox this project was scaffolded in (no live DB to actually run `next dev` against), so the current setup follows official Prisma guidance rather than preemptively working around an unconfirmed issue — but if this exact error shows up, that's the fix to reach for.
- **Clerk v7:** `auth()` is async and returns `isAuthenticated` explicitly — don't rely on truthy `userId` alone to check sign-in state. **`SignedIn`/`SignedOut` no longer exist** — they're replaced by a single `<Show when="signed-in">` / `<Show when="signed-out">` component (also accepts `{ role: "..." }`, `{ permission: "..." }`, etc., or a predicate function), imported from `@clerk/nextjs` same as before. `SignInButton`, `SignUpButton`, `UserButton`, `SignOutButton` are unchanged.
- **Webhook verification:** `verifyWebhook(req)` from `@clerk/nextjs/webhooks` (not manual `svix` package usage) reads `CLERK_WEBHOOK_SIGNING_SECRET` automatically. See `src/app/api/webhooks/clerk/route.ts` for the working pattern — it's already wired to create/link/deactivate `Volunteer` rows on `user.created`/`user.updated`/`user.deleted`. If `src/proxy.ts` ever grows real route protection (it's currently a bare `clerkMiddleware()` with nothing enforced), the webhook route must stay excluded from it — Clerk's webhook POSTs carry no user session, only svix signature headers.

If a future session needs a package bumped further, re-verify against that package's actual current docs before writing code against it from memory — this project got burned once already by assuming Prisma 5/6-era conventions applied.

## Read CONTEXT.md First

Read `CONTEXT.md` before starting any new feature or schema change. It has the reasoning behind every table — most alternate designs that look "obvious" were already considered and rejected for a specific reason documented there. This file is the working conventions; `CONTEXT.md` is the why.

## Project Snapshot

Internal operations platform for a working horse rescue, built and maintained as an ongoing volunteer contribution — not a funded project. It needs to keep running on $0/month indefinitely and needs to stay maintainable by one person with limited spare time, possibly handed off eventually to someone less technical. Prioritize simplicity and clarity over cleverness in every decision. If two approaches are roughly equal in effort, take the one that's easier to understand six months from now with no memory of why it was built that way.

## Stack

Next.js (App Router) + TypeScript, Tailwind CSS, Postgres (Neon) + Prisma, Clerk (auth only — not authorization), Cloudflare R2 (file storage), Pusher (chat), Resend (email), Playwright + TypeScript (E2E testing), Vercel + GitHub Actions (CI/CD, cron jobs).

## Non-Negotiable Constraints

- **Stay on free tiers.** Do not add a paid dependency, a paid tier of an existing service, or anything with a per-seat/per-usage cost without flagging it explicitly first. The one intentional exception already agreed to is the possibility of a paid Neon tier purely for backup convenience — everything else stays free by default.
- **No hard deletes on `Horse` or `Volunteer` records**, or anything hanging off them (feeding, medical, weight, pasture history). These move through status fields, never `DELETE`. This is a legal-defensibility requirement, not just a style preference — some horse records may need to hold up as evidence in active custody proceedings.
- **ChangeLog is append-only.** Never write code that edits or deletes an existing `ChangeLog` row. Corrections are new rows.
- **Authorization lives in the database, not Clerk.** Every permission check goes through `Volunteer.role`, not Clerk metadata. Clerk only answers "who is this."

## ChangeLog Implementation

Already built in `src/lib/prisma.ts` — `withChangeLog(base, changedBy, note?)` wraps the base Prisma client in a Client Extension that intercepts `create`/`update` on tracked models and writes field-level diffs automatically. Every server action or route handler that writes to a tracked model should call `withChangeLog(prisma, currentVolunteer.id)` (from `src/lib/auth.ts`'s `requireVolunteer()`) rather than writing to `prisma` directly, and never call `prisma.changeLog.create()` by hand — if you find yourself doing that, the write should go through the extension instead.

Tracked models (per `CONTEXT.md` §4): `Horse`, `Volunteer`, `FeedingBaseline`, `FeedingOverride`, `MedicationRegimen`, `CareEntry`, `HealthIssue`, `WeightEntry`, `HorseMetric`, `PastureAssignment`, `Placement`, `CredentialRecord`. Add new models to the `trackedModels` array in `src/lib/prisma.ts` when they're introduced, not to a separate list — there is only one source of truth for what's tracked.

Logs both `CREATE` (one row per field, `oldValue: null`) and `UPDATE` (field-level diff only, not whole-record snapshots). `updatedAt` is deliberately excluded from diffing since it changes on every write and would just be noise.

## Schema Conventions

- `cuid()` for all IDs.
- camelCase field names, no `@map`/`@@map` to snake_case.
- `Decimal`, never `Float`, for any measured quantity (feed amounts, weights, metrics) — avoids floating-point rounding drift.
- New repeating categorical values (a new feed type, a new care type, a new credential type) are lookup table rows added through the app, not new enum values requiring a migration. Reserve real Prisma enums for things fixed by actual real-world logic (`Role`, `ShiftType`, `HandlingColor`, `HorseSex`) that won't casually grow.
- Before adding a new table for "something they might want to track later," check whether it actually fits the generic `HorseMetric` pattern (point-in-time numeric measurement) first — that table exists specifically to absorb future measurement types without a migration.

## Permissions Quick Reference

| Role | Can write | Read scope |
| --- | --- | --- |
| ADMIN | Everything | Everything |
| SHIFT_LEAD | `CareEntry`, `FeedingOverride`, `CheckIn` (their shift) | All shifts/check-ins org-wide |
| VOLUNTEER | Own `CheckIn` | Own data, shift-relevant feeding/pasture info |
| GUEST | Nothing by default | Time-boxed, read-only |

`SHIFT_LEAD` and `VOLUNTEER` never get write access to `FeedingBaseline`, `Horse` core fields, `Volunteer` records/roles, or `PastureAssignment` — those stay Admin-only regardless of how the UI is framed.

## Repo Layout — What Already Exists

- `prisma/schema.prisma` — the full Phase 1 schema.
- `prisma/seed.ts` — seeds lookup tables (`CredentialType`, `FeedType`, `CareType`, `WorkType`, `MetricType`) and `Field` rows for the known field codes. Run via `npm run db:seed`. The RP1–RP6 turnout/bring-in order values in there are a rough approximation from the manual (it lists them as one block, not individually ordered) — confirm the real per-field order before relying on it for anything user-facing.
- `src/lib/prisma.ts` — Prisma client singleton (with the `@prisma/adapter-pg` driver adapter Prisma 7 requires) plus the `withChangeLog` extension.
- `src/lib/auth.ts` — `getCurrentVolunteer()`, `requireVolunteer()`, `requireRole()`. Resolves a Clerk session to the matching `Volunteer` row.
- `src/proxy.ts` — Clerk middleware (Next.js 16 naming).
- `src/app/api/webhooks/clerk/route.ts` — Clerk webhook handler, creates/links/deactivates `Volunteer` rows on user lifecycle events. Matches admin-entered records by email when linking a fresh signup to an existing pre-entered row rather than creating a duplicate.
- `src/app/admin/page.tsx` — first protected page, proves `requireRole` works end to end. Treat this as a diagnostic scaffold, not a real admin dashboard — replace once real admin features exist.
- `src/app/page.tsx` — homepage with Clerk sign-in wired up via `Show`/`SignInButton`/`UserButton`.
- `.github/workflows/ci.yml` — lint, typecheck, Playwright on every PR/push to `main`.
- `.github/workflows/nightly-backup.yml` — nightly `pg_dump` to R2 plus the Neon keep-alive ping, per `CONTEXT.md` §2.
- `tests/e2e/smoke.spec.ts` — placeholder; replace with real coverage as features land, don't just add alongside it.

## Testing

Playwright + TypeScript for E2E, matching prior projects (Shenny, testLens). Cover the check-in/out flow, feeding baseline+override interactions, and pasture reassignment early — these are the highest-traffic, highest-consequence flows in daily use.

## Things to Ask About Before Building, Not Assume

- Anything touching `RecurringCareSchedule` cadence values — real farrier/vet timing isn't documented yet.
- Anything touching `GuestAccess`-style flows — deliberately underbuilt in Phase 1, don't over-invest until it's a confirmed need.
- Exact tier-progression timelines (Green→Orange→Yellow) — currently approximate, get the real written schedule before hardcoding anything UI-facing that states a duration.
- Any UI that surfaces org-wide `ChangeLog` history to `SHIFT_LEAD` — the schema supports it, but the visibility boundary for that role specifically hasn't been finalized.
