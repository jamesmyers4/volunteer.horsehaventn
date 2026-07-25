# Working With Qwen2.5-Coder (and Other Local LLMs) — Blueprint

## Status

The first real task list run against this pattern (16 tasks, `ChangeLog`-bypass fix + auth-ordering fix + missing-`orderBy` fix + a doc sync) completed 2026-07-25. Qwen2.5-Coder followed every task's boundaries exactly — no scope creep, no unrelated edits, correct sequencing on dependent tasks. One bug shipped anyway: Task 1's own spec (written by Claude, not qwen) replaced an atomic `prisma.shift.upsert()` with a non-atomic find-then-create, introducing a race condition qwen had no way to know to look for since the task was framed as "mechanical." See "Lessons learned" below — that's the one real gap this run exposed, and it's a task-authoring gap, not a qwen-execution gap. Full history of that task list lives in git log / `SUMMARY.md`'s audit findings — this file is deliberately not a historical record, it's a template for the next one.

---

## What local models are good for here

Small, independent, fully-specified, verbatim-matched code edits: swap one expression for another, add one field to an object literal, wrap an existing line in a conditional, sync a doc sentence to match code. Anything where the "right answer" can be written out completely in the task itself and checking correctness is a `grep`/`tsc`/`eslint` command, not a judgment call.

## What local models are not good for here

Anything requiring:
- **A design decision** ("should this be blocked or allowed with a flag" — that's a human call, see `CLAUDE.md`'s "Things to Ask About Before Building, Not Assume").
- **Judging whether a replacement preserves a non-obvious property of the original code** — atomicity, transaction boundaries, error-handling behavior, timing/ordering guarantees. A local model executing a task verbatim will faithfully reproduce a subtle bug if the task itself contains one; it has no reason to second-guess instructions framed as "mechanical." This is on whoever writes the task list (Claude, in this project's workflow) to catch before handing it off — see the lesson below.
- **Anything touching `tests/`, `prisma/schema.prisma`, or requiring `prisma migrate`** — never delegate these to an unsupervised local task list regardless of how small the change looks.
- **Vague or open-ended instructions** ("clean this up," "make this better") — local models need the exact before/after text, not a description of intent.

---

## Lessons learned (update this section after every run)

1. **A task that removes a Prisma `upsert(...)` needs an atomicity check before it's handed off.** `upsert` compiles to a single atomic `INSERT ... ON CONFLICT`. Any replacement — a helper, a `findUnique`+`create` pair, anything with more than one round trip — is a TOCTOU race under concurrent callers unless the replacement explicitly handles the "someone else created it between my check and my write" case (e.g. catching the unique-constraint error and re-fetching). Whoever authors task 1 of a list like this must resolve this *before* task 1 goes out, not discover it in review afterward. (This is exactly what happened on 2026-07-25 — caught by human review of already-committed Task 1 code, not by qwen, and not by the original task author until re-reading it.)
2. **Verbatim "Current code" blocks worked well as a guardrail.** Requiring an exact match before editing, with an explicit "STOP, don't improvise" instruction, meant qwen never silently adapted to a codebase that had drifted from what the task assumed. Keep this pattern.
3. **Explicit dependency ordering (`Tasks 2–7 depend on Task 1`) was followed correctly**, including the subtler case (Task 6 leaving a known-bad permission-ordering issue alone because its *own* fix was deferred to Task 8). Local models handle "do X now, something else fixes the other problem later" fine as long as it's stated, not implied.
4. **Boundaries scoped to "this one function/query, not the JSX below it" held.** Even in large files (`feed-board/page.tsx`), qwen touched only the named `prisma.*` call and nothing else in the file.

---

## Task-list template

Copy this structure for the next batch of mechanical fixes:

```markdown
# Task List for Local AI Agent (<model name>)

## Read this whole section before doing anything

You are working in <repo/stack one-liner>. This document contains **N numbered tasks**.
Each task is a small, independent, mechanical code change.

**Rules you must follow:**

1. Do exactly one task at a time. Finish it, run its success check, and stop.
2. Only touch the file(s) named in that task. Do not "improve," reformat, rename, or refactor
   anything else you notice while you're in there for a different reason.
3. <Any file-type-wide guardrail specific to this repo, e.g. "don't touch .tsx JSX/markup,
   only the named prisma.*.findMany call.">
4. Match the "Current code" block exactly before editing — it's copied verbatim from the real
   file. If it doesn't match (even by one character), STOP. Don't guess, don't improvise a fix.
5. Never touch <tests/ dir>, <schema file>, never run <migration command> — none of these
   tasks require it.
6. Do the tasks in order if any task depends on a prior one's output (name the exact
   dependency, e.g. "Tasks 2–7 call a helper Task 1 creates").
7. After each task, run its **Success check** before moving to the next. If it fails, re-read
   and fix — don't proceed with a failing check.

If a success-check command needs infrastructure you don't have (a DB, a running server), run
the grep/tsc/lint parts only — they don't need it and still verify textual correctness.

---

## Task N — <one-line description>

**Requires:** <prior task # or "nothing">

**Why:** <the actual reason, in plain language, so the model isn't just pattern-matching>

**File to edit:** `path/to/file.ts`

**Current code:**
\`\`\`ts
<verbatim block copied from the real file, enough surrounding context to be unique>
\`\`\`

**Replace with:**
\`\`\`ts
<exact replacement>
\`\`\`

**Boundaries:** <what NOT to touch in this same file/function, explicitly>

**Success check:**
\`\`\`
grep -n "<something that proves the edit landed>" path/to/file.ts
\`\`\`
should <exact expected output>. Also run `<typecheck/lint command>` — no new errors.

---

## Final combined check (run once after all tasks are done)

<grep/tsc/lint commands that verify the whole batch together, not just each task individually>
```

---

## Pre-flight checklist for whoever authors the task list (Claude, most likely)

Before handing a task list to a local model, for **each** task that changes runtime behavior (not pure syntax/doc edits):

- [ ] Does this replace a DB operation that had an implicit guarantee (atomicity, ordering, a unique-constraint upsert, a transaction)? If yes, does the replacement preserve it, or does it need explicit error handling to?
- [ ] Is the "Current code" block copied character-for-character from the actual current file (not from memory of what it should look like)?
- [ ] Does the success check actually distinguish "did it right" from "did it wrong" — not just "did *something*"?
- [ ] Is every cross-task dependency named explicitly, including the "this task leaves a known issue for a later task to fix" case?
- [ ] Would a human reviewer, reading only this one task in isolation with no other context, be able to verify it's correct? If the answer requires knowledge from three other files, the task isn't actually independent — split it or add that context inline.

## Post-run checklist (for whoever reviews qwen's — or any local model's — output)

- [ ] Diff every touched file against the task's own "Replace with" block — exact match, not "close enough."
- [ ] Confirm nothing outside the named boundaries changed (`git diff --stat` file list should match the task list's file list exactly).
- [ ] Run typecheck + lint across every touched file.
- [ ] Re-examine each task's underlying design for the atomicity/ordering/error-handling class of bug described above — this is squarely on the reviewer, not the local model, to catch.
- [ ] Run the test suite if a DB is available; note explicitly if it wasn't and this step was skipped.
