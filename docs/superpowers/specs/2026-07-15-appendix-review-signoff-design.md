# Appendix 2 review sign-off (Part B checklist)

Date: 2026-07-15
Status: implemented (frontend-only, no DB migration)

## Problem

On the Part B conditions checklist it was unclear (a) which rows the advisor still
had to look at, (b) that "leave it as Insufficient info" is a valid review outcome
that must be confirmed, and (c) when "Confirm appendix" would unlock. The old gate
blocked confirm whenever a no-risk appendix still had "Insufficient information"
rows, with no way to deliberately keep one. The "27 conditions" / "5 need review"
counters at the top of the page added noise without helping.

## Design

**Per-row review sign-off.** Every flagged condition (Triggered, Insufficient
information, or not assessed/ungrounded; in client scope) carries its own review
control next to the status pill:

- Unreviewed: a bordered "Mark reviewed" button with a terracotta dot. Clicking it
  signs the status off as it stands, including the deliberate choice to keep
  "Insufficient information".
- Reviewed: a quiet sage "Reviewed" check; clicking it undoes the sign-off.
- Changing a row's status also counts as the review (the advisor made an explicit
  call), so no second click is needed on that path.

**Storage.** `AppendixRow` gains optional `reviewed` / `reviewedBy` / `reviewedAt`
inside the existing rows JSONB, so there is no DB migration and no Deno change.
The review toggle persists via a rows-only update (`saveRows`); it writes no
`atad2_appendix_edits` entry because the field CHECK does not cover it and the
who/when audit already lives on the row. A regeneration that rebuilds an AI row
drops the flag, so fresh output is reviewed again; advisor-edited rows are
preserved server-side as before.

**Confirm gate** (`appendixConfirmReadiness`): confirm is allowed once every
flagged, in-scope condition is reviewed. The old "no Insufficient info on a
no-risk appendix" rule is replaced; excluded rows never block; a skipped
checklist page bypasses the gate as before (its forward action is a plain Next).

**Progress display.**
- The top "27 conditions · 5 need review" strip is gone; only the (i) status key
  remains, right-aligned.
- Section chips now count *pending* reviews (they shrink as the advisor works)
  and flip to "Complete" at zero. Sections with a pending review open by default.
- Next to "Confirm appendix" in the footer: "2 of 5 reviewed" with a terracotta
  dot while pending, then a sage check with "All 5 reviewed" when the button
  unlocks. A plain-language block reason also renders under the checklist.

## Touched files

- `src/lib/appendix/types.ts` — reviewed fields on `AppendixRow`
- `src/lib/appendix/needsAttention.ts` — `conditionReviewPending`,
  `partBReviewProgress` (replaces `partBDigest`)
- `src/lib/appendix/confirmGuard.ts` — review-based gate
- `src/lib/appendix/client.ts` — `saveRows`
- `src/components/appendix/v2/ChecklistV2.tsx` — counters removed, per-row
  review control, pending-based section chips
- `src/pages/AssessmentAppendix.tsx` — review handler, status-change stamps
  review, footer progress chip
- Tests: `confirmGuard.test.ts`, `needsAttention.test.ts`,
  `ChecklistV2.dom.test.tsx`

## Out of scope

Part A (facts) review flow, the read-only overview table, the Word export, and
the edge function are unchanged. `AppendixDigest` stays for Part A.
