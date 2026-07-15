# Horse Haven of Tennessee — Internal Operations Platform

Internal volunteer and horse operations platform. Built and maintained as an ongoing volunteer contribution.

Read `CONTEXT.md` before touching the schema — it has the reasoning behind every table. Read `CLAUDE.md` before writing code in this repo — it has working conventions and flags a few package-version traps already hit once during scaffolding (Next.js 16, Prisma 7, Clerk v7 all differ from older/more commonly assumed conventions).

## Setup

```
npm install
cp .env.example .env
```

Fill in `.env`: `DATABASE_URL` (Neon), Clerk keys, R2 keys, Pusher keys, `RESEND_API_KEY`.

```
npm run db:migrate
npm run db:generate
npm run db:seed
npm run dev
```

## Scripts

- `npm run dev` — local dev server
- `npm run db:migrate` — create/apply a migration
- `npm run db:generate` — regenerate the Prisma client (required after any schema.prisma change)
- `npm run db:seed` — seed lookup tables and field codes
- `npm run db:studio` — Prisma Studio
- `npm run test:e2e` — Playwright E2E suite
- `npm run lint` — ESLint

## Stack

Next.js (App Router) + TypeScript, Tailwind CSS, Postgres (Neon) + Prisma, Clerk (auth), Cloudflare R2 (files), Pusher (chat), Resend (email), Playwright (E2E), Vercel + GitHub Actions (CI/CD, nightly backup cron).

## Status

Phase 1 scaffold — schema, auth wiring, and ChangeLog mechanism are in place. No feature UI yet. See `CONTEXT.md` §15 for the Phase 1/Phase 2 split.
