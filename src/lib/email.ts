import { Resend } from "resend"

// First real use of Resend in this codebase (V2.md Session 4 — event signup/cancellation/
// waitlist-promotion notifications). CONTEXT.md §7 already earmarks Resend for credential/
// training expiration reminders too; this wrapper is generic enough to cover that later.
//
// RESEND_API_KEY is now set in this project's .env (a real key, created for volunteerOps in
// Resend, added shortly after this file was first written) — but a missing key here still
// degrades to a no-op rather than crashing, unlike src/lib/r2.ts's hard throw-if-unset. This
// module is imported at Next.js build time by every page/action that touches events, so a
// hard throw would break `next build` for the whole app over an unset *optional* notification
// feature the moment the key goes missing again (a fresh clone, a wiped .env, a different
// deploy environment) — confirmed the hard way once already, see HANDOFF.md.
const apiKey = process.env.RESEND_API_KEY
const resend = apiKey ? new Resend(apiKey) : null

// Falls back to Resend's own onboarding sender, which only reliably delivers to the
// account's own verified address until a real domain is verified — fine for dev, see
// .env.example. Production needs EMAIL_FROM set to a verified sender.
const FROM = process.env.EMAIL_FROM || "Horse Haven Ops <onboarding@resend.dev>"

/**
 * Best-effort send — logs and swallows failures (including a missing API key) rather than
 * throwing. A volunteer's signup or cancellation must succeed even if Resend is down,
 * unconfigured, or (against real Resend with no verified domain) rejects the recipient —
 * notification delivery is a courtesy, not a transactional guarantee this app can make on a
 * free-tier email provider.
 */
export async function sendEmail(params: { to: string; subject: string; text: string }) {
  if (!resend) {
    console.warn(`sendEmail skipped — RESEND_API_KEY not set (to: ${params.to}, subject: "${params.subject}")`)
    return
  }
  try {
    await resend.emails.send({ from: FROM, to: params.to, subject: params.subject, text: params.text })
  } catch (error) {
    console.error(`sendEmail failed (to: ${params.to}, subject: "${params.subject}"):`, error)
  }
}
