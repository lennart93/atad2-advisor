# Design notes — monochrome refactor

A surface-level visual/UX refactor of the whole tool. No functionality, routing, data flow,
or component structure changed; only color, badges, copy density, spacing, type and interaction
states. The goal: stop the app reading like a wireframe and make it feel as finished and confident
as the Overview / structure-chart screen (the north star).

## The core problem this fixes

1. **Blue was doing everything.** Phase 1 of the design system had defined a single blue accent
   (`--ds-accent: #185fa5`) and spread it across ~79 sites: the active step, the FY tag, focus rings,
   hovers, links, suggested answers, the taxpayer node, and "triggered" findings. Because the brand
   is monochrome (black logo, black primary button), generic blue everywhere read as *un-themed
   default component color* rather than a deliberate choice. That is what made it feel like a blueprint.
2. **Three overlapping explanation layers**, repeated per item (intro box + a paragraph under
   "Could you please confirm" + a per-card helper, plus a placeholder saying the same thing).

## Decisions

- **Fully monochrome accent.** The one accent is near-black, reserved for exactly two places
  app-wide: the **active wizard step** and the **structure-chart focus node**. Everything else that
  was blue is now neutral ink/grey.
- **Whole-tool scope.** The client-facing wizard *and* the internal admin pages were brought onto
  the token system (the admin pages carried a rainbow of indigo/cyan/pink/purple hexes).
- **One-token leverage.** The accent is centralized in three CSS vars
  (`--ds-accent` / `--ds-accent-bg` / `--ds-accent-text` in `src/styles/tokens.css`). Retuning those
  to near-black neutralized most of the 79 sites automatically (focus rings, the FY tag, tinted
  chips), because they already routed through the token. **Escape hatch:** to reintroduce a colored
  accent later (e.g. a muted slate), change only that trio — nothing else needs to move.
- **Active step + focus node are *filled* dark**, not a tint. The stepper active step is
  `bg-ds-accent text-ds-card` (solid near-black pill, white text); the structure focus node keeps its
  dashed `focusStroke` pointed at `var(--ds-accent)`. Fill (not hue) makes them the strongest marks.
- **Risk = amber, never blue.** `StatusPill`'s `triggered` variant now renders amber. Its only real
  consumer is the genuine ATAD2 risk outcome ("ATAD2 risk identified", triggered appendix conditions,
  hybrid mismatch, transparency, acting-together). The one non-risk consumer (EditableAnswer's
  "suggested · NN%" badge) was switched to `neutral`.
- **Amber discipline.** Amber means the *real ATAD2 risk outcome* plus genuine *blocking/validation*
  attention (form errors, a banner that blocks the chart, the draft-pending-review banner). Procedural
  amber (stale/sync/orphan/reopened, doc-quality "good" tier, "looks empty", upload "Failed", pending
  quotes, feedback "new", decorative category colors) was neutralized so amber stays rare and meaningful.
- **Green = answered/done/complete only** (checks, "Saved", "Ready", completed/sold/booked, clean
  "not triggered" outcome). Not "active"/"selected"/"best match"/"pipeline".
- **Red = destructive actions only** (delete/discard with data loss). Error *states*, "No" answers,
  diff "removed" markers, and "bug"/"deleted" badges were neutralized.
- **Diffs are monochrome.** Added text = ink (italic/underline), removed = ink-tertiary strikethrough.
  The navy `#003366` "added" color and the red "removed" were dropped, in both the React legend and the
  raw-HTML generator (`textDiff.ts`), kept in sync.
- **Structure-chart domain palette kept.** The shape-driven tax-chart language (parchment/white fills,
  grey ownership edges, ink outlines/text, fiscal-unity grey frames, drop-valid green / drop-invalid
  red) is intentional and untouched. Only the incidental blue chrome (selected-stroke,
  ownership-selected-stroke, the taxpayer blue wash) was neutralized to ink.
- **Admin question-flow edges** (Yes/No/Unknown), the one genuinely functional admin color, were moved
  to ink shades (the edges carry text labels, so color was redundant). A known legibility trade-off,
  easy to revisit.
- **Copy:** one short intro line per screen; duplicate explanation paragraphs and per-card helpers
  removed; placeholder *xor* helper; plain sentence case; **no em-dashes**; English only; **neutral
  voice** (the app does not narrate its own actions in first person, except the client letter, the
  feedback widget, and consent checkboxes — per project conventions).

## Foundation changes (hand-locked, then everything built on top)

- `src/styles/tokens.css` — `--ds-accent` trio retuned to monochrome near-black (light + dark);
  comments rewritten to the two-sanctioned-uses rule; amber comment clarified to "real risk".
- `src/components/ds/status-pill.tsx` — `triggered` → amber; doc rewritten (no blue pill).
- `src/components/ds/stepper.tsx` — active step (full track + compact popover) → solid near-black fill.
- `src/components/ds/process-checklist.tsx` — in-progress spinner → neutral ink (not accent).
- `src/components/ds/OptionCheckbox.tsx` — raw zinc hex → ds ink/hairline tokens.
- `src/components/ds/index.ts` — ground-rules comment updated to the monochrome rule.
- `src/components/AssessmentProgressIndicator.tsx` — fill neutral grey until complete, green at 100%
  (one progress signal per the copy rule).

## Per-area migration

Applied across the whole tool (7 disjoint file partitions, each migrated then independently verified, plus
a completeness sweep). Highlights:

- **Shell / chrome** — `DossierTag` FY tag + folder/plus icons neutralized; `AssessmentSidebar` selected-row
  border → ink and the raw emerald/red/blue answer spans rewritten onto `StatusPill`; `SessionRow` + `Index`
  dropped the colored left rails (status now via `StatusPill`); `AssessmentShell`/`AssessmentFooterSlot` on ds
  tokens. `AppLayout` left on the legacy shadcn neutrals (already near-black, not blue) to preserve its glass
  header; a full ds migration of that header is a separate optional pass.
- **Points to confirm** — the `Needs input` badge **deleted** (open rows show no badge; only `Answered` stays
  green); the per-card helper sentence removed; the three explanation layers collapsed to **one** neutral intro
  line; the "Could you please confirm" paragraph removed; the Analyzing progress bar → ink; spinners and the
  resize grip neutralized.
- **Intake / upload / prefill** — suggestion card → neutral rail + fill; upload spinners / "Failed" / "looks
  empty" → neutral (`Ready` stays green); document-quality "good" tier amber → neutral; upload/skip/quality copy
  rewritten to passive neutral voice; placeholder-xor-helper applied.
- **Structure (north star)** — `palette.ts` selected / ownership-selected / taxpayer-wash strokes → ink, focus
  node stroke → `var(--ds-accent)` (the one sanctioned accent); the domain parchment/grey palette and the
  drop-valid-green / drop-invalid-red affordance kept; context-panel Yes/No/Unsure icons → green/ink/ink;
  refining dot and "disconnected" → neutral; inspectors tokenized (delete stays red); refining-callout copy
  collapsed and the hard-coded "2 minutes" dropped.
- **Confirmation / Appendix / Report** — `EditableAnswer` "suggested" badge → neutral and suggestion card
  neutralized; `AppendixTable` triggered condition → amber, association legend → ink; `FactsPanel` register
  chrome neutralized while the genuine ATAD2-risk amber (hybrid mismatch / transparency / acting-together) kept;
  report stale notices → neutral, raw hex → token; `MissingExplanationsPopover` five random copy variants → one
  fixed neutral line; `MemoFeedbackEditor` rails/tints neutralized; confirmation copy collapsed.
- **Admin (whole-tool scope)** — `entityColors` rainbow → neutral (risk chips → amber/neutral); `StatChip`
  tones on ds tokens; `AdminCard`/`AdminSidebar` tokenized (pink badge → ink); KPI trends / sparklines → neutral;
  `QuestionFlowCanvas` answer edges → ink shades (labels carry the meaning); blue "info" panels / preview
  gradients → neutral; all word-diffs → monochrome; selected-card rings → ink; deletes → ds-red.
- **Misc / diff / print** — `SecurityAlert` variants → neutral; feedback category icons → ink; `NotFound` → ds
  tokens; the memo diff fully monochrome (navy/red dropped in both the React legend and the raw-HTML
  `textDiff.ts`, kept in sync), Accept → ink primary, Reject → neutral; appendix `status.ts` gate-triggered blue
  → neutral and operative-triggered red → amber (screen + print), draft-pending banner kept amber.
- **Completeness-sweep gaps** (files no partition owned) — `Assessment.tsx` (the Questionnaire: clickable terms,
  example toggle, selected + suggested answer options, committing textarea, reminder line all neutralized);
  `Tutorial.tsx` (done dot → green, "Finish tour" → ink primary); `ui/badge.tsx` `live` variant → ds-green;
  `ui/button.tsx` default gradient slate → zinc (removing the last cool/blue tint).

After migration: `tsc --noEmit` clean, `npm run build` clean, dev server boots with 0 console errors, and the
only raw color left in `src` is the shadcn destructive-toast red (a correct destructive-context use).

## Refinement pass — crisp step nav + chips

Follow-up to make the chrome crisp rather than bubbly/dated (fully-rounded, heavily filled shapes read as
unfinished). Hierarchy now comes from fill + weight, not pill shape.

- **New radius token** `--ds-radius-chip: 6px` (Tailwind `rounded-ds-chip`) — one tight value for all small
  chrome. Buttons (`control` 8px) and cards (`card` 12px) keep their radii. Rule: no large fully-rounded filled
  shapes anywhere; small circular badges/dots/avatars stay round.
- **Stepper redesigned** (`ds/stepper.tsx`) — the filled pill around the active step is gone. Every step is now a
  ~20px circular number badge + label beside it: **active** = filled near-black badge, white number, near-black
  medium label; **completed** = green check in a thin ring, ink label; **upcoming** = thin grey (hairline) outline
  circle, grey number, grey label. Thin connector lines unchanged. Applied to both the full track and the compact
  (<1200px) popover; the popover's active row dropped its solid-dark fill for a light `fill-muted` highlight.
- **Chips → 6px** — `StatusPill` and the shadcn `Badge` base moved from `rounded-full` (stadium) to
  `rounded-ds-chip`; the appendix status-select chip and the feedback FAB likewise lost their stadium shape (FAB →
  `rounded-ds-control`). Dots, progress bars, icon circles, small count badges, and avatars stay round.
- **FY tag de-chipped** (`DossierTag`) — `FY2022` no longer sits in its own pill inside the dossier button (no
  chip-in-a-chip). It renders as muted secondary text after the entity name, separated by a subtle 1px hairline
  divider. The button's aria-label still announces the fiscal year.

## Known follow-ups / borderline calls

- Several "needs attention / out of sync / review again" states were neutralized rather than kept
  amber. If the team wants a sanctioned non-risk "attention" amber, those are the sites to revisit.
- Admin question-flow edge legibility (ink shades vs. the old green/red) — revisit if it hurts.
- A number of pre-existing raw `stone-*` / `border-subtle` neutrals in the structure inspectors and
  facts panel were tokenized opportunistically; any missed ones are neutral already (not blue).

## Terminology (hard rules)

- Use "transaction", never "flow". No exceptions.
  Rewrites: "this flow" -> "this transaction";
  "the flow crosses a border" -> "the transaction crosses a border".
- Use "jurisdiction(s)", never "state(s)" or "country/countries" in
  assessment and classification context.
  Rewrites: "in the two states" -> "in the two jurisdictions";
  "home-state classification" -> "home-jurisdiction classification".
- Section title is "The taxpayer and the group" (taxpayer first).

## Section headers (hard rule)

- Section headers show the title only; no inline counts or status summaries.
- The only element right of a section title is the "N need review" badge when N > 0.
