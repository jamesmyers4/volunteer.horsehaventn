# Horse Haven of Tennessee — Volunteer & Operations Platform

An internal operations platform for [Horse Haven of Tennessee](https://horsehaventn.org), a working equine rescue nonprofit. Built pro bono to replace manual Google Form and spreadsheet workflows for volunteer check-in, animal care tracking, and (in progress) event scheduling and training records.

This is a separate internal tool on its own subdomain — the public site (donations, adoption info) stays on its existing platform and is untouched by this project.

## Status

**Phase 1 is complete and verified.** V2 is in progress — see [`V2.md`](./V2.md) for the full session-by-session build plan. Each V2 session is scoped to be implemented independently, followed immediately by matching test coverage, with an explicit stop between sessions.

## Tech Stack

- **Next.js 16** (App Router)
- **TypeScript**
- **Tailwind CSS**
- **Prisma 7** + **Neon** (Postgres)
- **Clerk** — authentication (authorization is handled separately, see below)
- **Cloudflare R2** — photo storage
- **Pusher** — real-time updates
- **Vitest** — unit/API/DB test suite
- **Playwright** — end-to-end test suite

## Architecture & Conventions

Full architectural reasoning lives in [`CONTEXT.md`](./CONTEXT.md); day-to-day working conventions and known version-specific gotchas (Prisma 7, Next 16, Clerk v7, R2) live in [`CLAUDE.md`](./CLAUDE.md). At a high level:

- **IDs & deletes:** cuid IDs throughout; no hard deletes on business entities.
- **Auth vs. authorization:** Clerk handles authentication only. Authorization is DB-side via `Volunteer.role`, one of `ADMIN`, `SHIFT_LEAD`, `VOLUNTEER`, or `GUEST`.
- **Extensible categories:** admin-editable lookup tables rather than hardcoded enums wherever a list is likely to grow (feed types, event categories, tags, etc.).
- **Audit trail:** field-level, append-only change log on records that may matter for legal/custody purposes — diffs, not full-record snapshots.
- **Recurring data:** a baseline-plus-override pattern (e.g. feeding amounts, shift times) — a default that individual instances can override without losing the default.

## Phase 1 — Complete

Four verified feature slices form the foundation everything else builds on:

- **Authentication** — Clerk webhook provisions a `Volunteer` record on signup; role-based access enforced on protected routes.
- **Volunteer check-in** — retrospective, single-submission logging matching the prior Google Form workflow.
- **Animal core CRUD + photo upload** — originally built against a `Horse` model; renamed to the more general `Animal` model in V2 Session 1 (see below) to properly cover mules, donkeys, minis, ponies, and non-equine animals.
- **Feeding baseline/override management** — per-animal recurring feed plan with dated overrides.

## V2 Buildout — In Progress

Full spec for every session: [`V2.md`](./V2.md). Sessions are meant to run one at a time, each ending with its own Playwright/Vitest coverage before the next begins.

- [x] **Session 1** — Rename `Horse` → `Animal`, add `species` field (horse/donkey/mule/mini/pony/cat/other)
- [ ] **Session 2** — Location model generalization (barn/stall/field/sick bay/arena, day vs. night assignment)
- [x] **Session 3** _(flagged — see note below)_ — Training tier progression (Green → Orange → Yellow → Blue) + compliance training
- [ ] **Session 4** — Volunteer tags & Go Team
- [ ] **Session 5** — Event scheduler & signup
- [ ] **Session 6** — Shift templates, seasonal hours & sign-in/out
- [ ] **Session 7** — Dashboards: Feed Board & Turnout Board
- [ ] **Session 8** — Admin console

> **Open question as of this update:** the most recent build reported "Session 2 complete" referring to Training Tier Progression — but per V2.md's current numbering, that's Session 3, and Session 2 (Location) doesn't appear to have been built yet. Confirm whether Location was intentionally skipped/deferred before treating this checklist as accurate, and correct this section once resolved.

### What's built as of the last verified session

- `Volunteer.firstShiftDate` (tenure clock starts at first check-in, not account creation), `Volunteer.blueReleasedAt`/`blueReleasedById` (manual-only Blue release), admin-editable `TierThreshold` table.
- Tier computed at query time via `computeTiers()` in `src/lib/tier.ts` — not cached/stored, to avoid drift.
- Compliance training reuses the existing `CredentialType`/`CredentialRecord` models rather than introducing new ones (documented deviation from the literal V2.md spec — `CredentialType` already covered this ground).
- New pages: `/volunteers`, `/volunteers/[id]`, `/tiers`, `/training`.

## Testing

- **Vitest:** 123 tests passing (unit/API/DB)
- **Playwright:** 31 tests passing (end-to-end)
- Full suite verified clean against a fresh DB reset, with clean `tsc`/lint.

Run locally:

```
npm run test          # Vitest
npm run test:e2e       # Playwright
```

_(Confirm these script names against `package.json` — update if they differ.)_

## Getting Started

```
npm install
cp .env.example .env    # fill in Neon, Clerk, R2, and Pusher credentials
npx prisma generate
npx prisma migrate dev
npm run dev
```

_(This section is a reasonable default for this stack, not verified against the current `package.json`/`.env.example` — confirm exact commands and required env vars before treating it as final.)_

## Project Docs

| File         | Purpose                                                                                            |
| ------------ | -------------------------------------------------------------------------------------------------- |
| `CONTEXT.md` | Full architectural decisions and the reasoning behind them                                         |
| `CLAUDE.md`  | Working conventions, naming, and known version-specific traps                                      |
| `V2.md`      | Session-by-session plan for the current buildout, including test coverage requirements per session |
| `HANDOFF.md` | Running notes on what's left, pending migrations, and known latent issues                          |

---

_This is a volunteer-built project for Horse Haven of Tennessee. Not affiliated with or maintained by any commercial entity._
