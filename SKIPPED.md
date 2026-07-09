# Goal A run, skipped / deferred / deviations

Branch `design/accent-focus-quickwins`. Two shared fixes + named quick wins.
Structural moves (appendix V2 flip, Overview decompose, deleting the old
accordion) were explicitly out of scope. Build stayed green throughout
(`tsc --noEmit`, 1170 vitest tests, `npm run build`).

## Deliberately left as-is (sanctioned terracotta)
Terracotta was kept only where the design system (or this brief) sanctions it:
- Active wizard step: `src/components/ds/stepper.tsx`.
- Structure-chart focus node / taxpayer hero: `src/lib/structure/palette.ts`.
- Brand focus ring (`--ring` = #c25c3c, `ring-ds-accent`) app-wide.
- WizardCard letterhead top border: `src/components/assessment/WizardCard.tsx:23` (brief: keep).
- Required-field asterisk: `src/components/ds/form-field.tsx:59` (brief: accept as the one exception).
- Auth marketing eyebrow + sign-in CTA arrow: `src/pages/Auth.tsx:368,512` (brief: do not touch).

## Deferred: broader terracotta sweep (NOT done, out of scope for this run)
The DoD line "terracotta appears only on the active step and the focus node,
nowhere else" was NOT fully met, on purpose, because reaching it would mean
touching out-of-scope or functional code. Left untouched:
- `src/components/appendix/FactsPanel.tsx` (the OLD accordion, ~15 terracotta
  uses: needs/selected/open markers, edit focus rings, chips). Brief says do
  not touch FactsPanel / the old accordion. Its terracotta dies when V2 ships.
- `src/components/appendix/ActingTogetherSection.tsx` (many): focus rings +
  the acting-together group builder's selected/active markers. Functional; not
  in the named list.
- `src/components/documents/DocumentsWorklist.tsx`, `WorklistPointsList.tsx`:
  the points-to-confirm worklist arrows/dots. Not in the named list.
- `src/components/MemoFeedbackEditor.tsx`, `EditableAnswer.tsx`,
  `AppendixDigest.tsx`, `AppendixRowItem.tsx`: focus rings + selected/needs
  markers. Functional; not in the named list.
- `src/pages/AssessmentReport.tsx:1229,1232`: the transient "generating" pulse
  indicator inside the memo. A loading state, not in the named list.
- `src/pages/Assessment.tsx:2544,2587-2603`: the QUESTIONNAIRE "No" answer
  option + question title use `ds-accent`. That is the questionnaire screen, not
  the intake form; the brief's intake sites (2161/2180/2325) were done.
These are a good second, deliberate sweep once the appendix V2 flip lands.

## Audit line references that were wrong (verified against the real code)
- `LowQualityGateDialog.tsx` is under `src/components/prefill/`, not
  `src/components/documents/`. Found + fixed the Plus icon there.
- FactsPanel em-dashes were claimed at `166,173`; those lines are the reasoning
  `<textarea>` (no dashes). The only dashes in FactsPanel are `const NA = '–'`
  (a functional "not applicable" marker glyph, line 81) and a code comment
  (line 354). Neither is user-facing prose, so no change. SKIPPED.
- Index `console.log` calls had shifted to 189/199/208/215 after earlier edits
  (brief said 188/198/207/214). Removed the right ones.
- The Overview terracotta card borders were 5 `<Card>` + 1 `<section>` (6 total),
  matching the brief's 6 line numbers.

## Deviations / judgment calls
- Confirmation risk driver chip (`AssessmentConfirmation.tsx:429`): neutralised
  to `bg-ds-fill-muted text-ds-ink-secondary` (neutral) rather than amber, so it
  stays distinct from the Unknown chip (which is amber). Still purges terracotta.
- Quality meter "Strong" tier: recoloured from sage to neutral, per "only the
  top tier uses sage". This downgrades Strong's previous sage. Taste call; revert
  to sage in `DocumentQualityMeter.tsx` if you prefer a two-tier sage.
- `deleteSession` (Index): removed the 4 console.log calls only (minimal scope).
  The pre-existing debug "does the session exist" query is left in place (its
  result is now unused but it was there before; noUnusedLocals is off).
- `memoAppendices.test.ts` palette assertion updated to the new intended colours
  (Triggered=amber `F8F0DA`/`8A6A1C`, Insufficient=slate `E9EDF0`/`4A5B6B`).
  A test pinned the old behaviour; the colour change is intentional.
- The Auth sign-in autofill / password-manager fix (from the design audit) was
  NOT in this run's batches and was left untouched (separate concern).

## Not verified live (logged out mid-run)
A page reload cleared the Supabase session, so the authed pages (dashboard,
confirmation, appendix, report) were gated on `tsc` + correct token usage rather
than a live screenshot. Batch 1's focus ring was verified live on `/auth` before
the logout. Recommend a quick visual pass after re-login, especially the amber
risk outcome on Confirmation/Report and the dashboard "+N" subject.
