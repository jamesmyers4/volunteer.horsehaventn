/**
 * V3.md Session 5: narrower than canManageShiftRoster (src/lib/shiftRoster.ts) on purpose — the
 * spec's own permission line is "only the shift's lead ... or ADMIN," not the Admin-or-
 * Shift-Lead-org-wide pattern the roster action uses. A global SHIFT_LEAD who isn't this
 * occurrence's assignedLeadId does NOT get to submit someone else's end-of-shift report.
 */
export function canSubmitShiftReport(actor: { id: string; role: string }, shift: { assignedLeadId: string | null } | null) {
  if (actor.role === "ADMIN") return true
  return shift?.assignedLeadId === actor.id
}
