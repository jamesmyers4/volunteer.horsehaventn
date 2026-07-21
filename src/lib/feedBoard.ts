// V4.md Session 2: automatic AM/PM switching for the Feed Board. Pure and side-effect-free,
// same "extract the derivation logic so it's exercised for real by both the UI and the tests"
// pattern as src/lib/shifts.ts's determineShiftTypeForNow — which already established the
// precedent of reading local time via Date's own getHours(), not a UTC-string parse, for
// "what part of the day is it right now" questions (as opposed to "what calendar day is it",
// which stays UTC-string elsewhere in this codebase).

export type FeedBoardShift = "AM" | "PM"

/** Before noon local time -> AM, at/after noon -> PM. Re-evaluated on every call — never
 * cached — so a screen left open across the noon boundary flips on its own the next time this
 * is called (each server render, including one triggered by AutoRefresh's polling tick). */
export function resolveFeedBoardShift(now: Date = new Date()): FeedBoardShift {
  return now.getHours() < 12 ? "AM" : "PM"
}

/** A viewer's explicit ?shift= override wins over the automatic noon-boundary switch — this is
 * the "check the other shift's chart without waiting" display toggle from V4.md Session 2. A
 * malformed/missing param falls back to the automatic value rather than throwing. */
export function resolveDisplayedFeedBoardShift(overrideParam: string | undefined, now: Date = new Date()): FeedBoardShift {
  if (overrideParam === "AM" || overrideParam === "PM") return overrideParam
  return resolveFeedBoardShift(now)
}
