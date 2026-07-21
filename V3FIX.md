V3FIX.md — Lookup Table Unique Constraint Backfill

How to use this document
This is a single standalone fix session — not part of V3.md's 7-session sequence, doesn't need to follow after Session 7. Same discipline as V2.md/V3.md: implement fully, write/extend Playwright/TypeScript tests following existing conventions, then STOP. Read prisma/schema.prisma, CONTEXT.md, and CLAUDE.md first, as always.

Background
CredentialType.name was made @unique in a V2.md Session 2 migration after discovering the seed script's createMany({ skipDuplicates: true }) call was silently duplicating every row on repeat seed runs — skipDuplicates only works against an actual unique constraint, and none existed. That fix was applied to CredentialType only; the same schema comment explicitly flagged that FeedType.name, CareType.name, WorkType.name, and MetricType.name have the identical gap and called it out as an unresolved follow-up. This session closes that follow-up.

Right now this hasn't caused visible damage because these tables have only been seeded once each, on a freshly migrated database. The risk is entirely in the next reseed of an already-populated database, which is a "when," not an "if," given how often this project reseeds fresh environments.

Goal
Add a real unique constraint to the four affected name fields so prisma db seed becomes actually idempotent for them, matching what's already true for CredentialType, ShiftTemplate (shiftType), FacilityTaskType (category), ChecklistTemplate (name), and VolunteerTag (name).

Data model:

FeedType.name — add @unique.
CareType.name — add @unique.
WorkType.name — add @unique.
MetricType.name — add @unique.

Before writing the migration, query each of these four tables in the local test database for any existing duplicate name values. Adding a unique constraint to a column that currently contains duplicates will fail to apply. If duplicates are found anywhere, stop and flag it in the session summary rather than silently deleting/merging rows — that's a data decision for the user, not something to resolve unilaterally.

Once confirmed clean, the migration itself is a straightforward additive unique-index migration, same shape as the CredentialType.name precedent.

No changes needed to the seed script itself — prisma/seed.ts already uses createMany({ skipDuplicates: true }) for all four of these models. Once the constraint exists, that existing code starts working correctly with zero code changes; the bug was purely a missing constraint, not incorrect seeding logic.

Test coverage to add:

Migration applies cleanly against a fresh test database.
For each of the four models, attempt to create two rows with an identical name and confirm it now throws a unique-constraint violation (Prisma P2002) — this proves the constraint is real and enforced, not just present in the schema file.
Run the seed script twice in succession against a freshly migrated, empty test database and assert the row count for each of the four affected tables is identical after both runs — this is the direct regression test for the bug this session fixes.
Full existing test suite still passes — if any existing test or seed path turns out to rely on creating two same-named rows in one of these four tables (an intentional duplicate, however unlikely), that's a real conflict to flag in the session summary, not something to quietly work around.

⏸ STOP — implement this fix and its tests, then wait for the user. Do not apply this migration to Neon as part of this session — same holding pattern as every other migration so far. The user applies it manually via prisma migrate deploy once they've reviewed the session summary.

Note for the user, not for Claude Code
Once this migration is applied to Neon, the correct order for what's still pending there is: migrate deploy first (picks up this fix plus anything else queued), then db:seed. Worth double-checking DIRECT_URL in .env resolves to the same Neon host seen in the migrate deploy output before running seed against it, since a pooled vs. direct connection-string mismatch would seed the wrong target silently
