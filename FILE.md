# SETUP-HORSEHAVEN-MINT.md

## Mission

Clone `jamesmyers4/volunteer.horsehaventn` into the current folder and get the full dev environment working on this Linux Mint laptop. Verify each phase before moving to the next. If a step fails, diagnose and fix before continuing — do not skip ahead.

## Project Snapshot

Horse Haven of Tennessee volunteer operations platform.

- **Framework:** Next.js 16 (App Router), TypeScript, Tailwind
- **Database:** Prisma 7 + Neon (serverless Postgres) — 27-model schema
- **Auth:** Clerk (v7) with webhook-driven user sync
- **Storage:** Cloudflare R2 (horse photos)
- **Realtime:** Pusher
- **Email:** Resend
- **Testing:** Playwright + TypeScript

All external services are cloud-hosted — nothing runs locally except Node and the dev server. No local Postgres or Docker needed.

## Phase 0 — Preflight (before cloning)

1. Confirm this is a Debian/Ubuntu-based system: `cat /etc/os-release` (Linux Mint expected).
2. Install base tooling if missing:

```bash
sudo apt update
sudo apt install -y git curl build-essential
```

3. Check Node version: `node -v`. Next.js 16 needs **Node 20.9+ — target Node 22 LTS**. Linux Mint's apt Node is almost certainly too old. If Node is missing or below 20.9, install via nvm:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm install 22
nvm alias default 22
```

4. Confirm git identity is set (`git config user.name` / `user.email`). If not, ask me for values — do not guess.

## Phase 1 — Clone

```bash
git clone https://github.com/jamesmyers4/volunteer.horsehaventn.git
cd volunteer.horsehaventn
```

**IMPORTANT:** If the clone comes back empty or the repo has no code, STOP and tell me — the code may not be pushed yet or may live under a different remote. Do not scaffold a new project in its place.

If pushing back to GitHub is needed later and HTTPS auth fails, ask me whether to set up SSH keys or a PAT — don't configure credentials on your own.

## Phase 2 — Dependencies

1. Detect the package manager from the lockfile: `pnpm-lock.yaml` → pnpm, `package-lock.json` → npm. Use whichever the repo uses; do not mix.
2. If pnpm is needed and missing: `corepack enable && corepack prepare pnpm@latest --activate` (or `npm i -g pnpm` if corepack misbehaves).
3. Install: `pnpm install` or `npm install`.
4. Read `package.json` scripts and report what's available (dev, build, test, prisma commands, etc.).

## Phase 3 — Environment Variables

1. Look for `.env.example` / `.env.local.example` in the repo and use it as the source of truth for required keys.
2. Create `.env.local` (and `.env` if Prisma reads from it — check `prisma.config.ts` or schema datasource). Expected variables based on the stack:

```
DATABASE_URL=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
CLERK_WEBHOOK_SIGNING_SECRET=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
R2_PUBLIC_URL=
NEXT_PUBLIC_PUSHER_KEY=
NEXT_PUBLIC_PUSHER_CLUSTER=
PUSHER_APP_ID=
PUSHER_SECRET=
RESEND_API_KEY=
```

3. **Ask me for the actual values** — I'll paste them in from my password manager / dashboards. NEVER commit `.env*` files; verify they're covered by `.gitignore` before doing anything else with git.
4. If the example file lists variables not shown above, include them and ask me about any you can't infer.

## Phase 4 — Prisma

Prisma 7 notes: client generation and config live in `prisma.config.ts` in newer setups — read the repo's actual config rather than assuming defaults.

```bash
npx prisma generate
```

- Do **not** run `prisma migrate dev` or `prisma db push` without asking me first — the Neon database is live and shared with my main machine. Generation only, unless I say otherwise.
- `npx prisma migrate status` is safe and useful to confirm the local schema matches the deployed DB.

## Phase 5 — Dev Server Smoke Test

```bash
npm run dev
```

(or the pnpm equivalent)

Verify:
1. Server starts clean on http://localhost:3000 with no env-var errors.
2. Homepage renders.
3. Clerk sign-in page loads (proves publishable key is valid).

Known limitation to report, not fix: **Clerk webhooks can't reach localhost.** User-sync-on-signup won't fire locally without a tunnel. Note it and move on unless I ask for tunnel setup.

## Phase 6 — Playwright

```bash
npx playwright install --with-deps chromium
```

- `--with-deps` will prompt for sudo to install system libraries — that's expected on Mint.
- If the apt package names fail (Mint occasionally lags Ubuntu naming), run `npx playwright install-deps chromium` separately and resolve missing libs one at a time.
- Then run the test suite per the repo's config (`npx playwright test` or the package.json script). Report pass/fail — some tests may require seeded data or auth state; report those as environmental, don't rewrite tests to force green.

## Phase 7 — Final Report

Summarize:
1. Node/package-manager versions installed
2. Which env vars are set vs. still missing
3. Prisma generate + migrate status result
4. Dev server smoke test result
5. Playwright install + test run result
6. Any deviations from this doc and why

## Ground Rules

- Ask before anything destructive or state-changing: DB migrations, git pushes, force operations, global config changes.
- Prefer reading the repo's actual configs over assumptions in this doc — the repo wins if they conflict.
- Code style: Playwright + TypeScript, no inline comments in any code you write, no blank lines within a function body, one blank line after a function or major block ends.