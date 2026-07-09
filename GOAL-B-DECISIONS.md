# Goal B, decisions and dependency map

Branch `goal-b-appendix-v2-overview`. Verified against the real code on 9 Jul 2026
(line numbers below are the verified ones, not the audit's).

## Phase 0, dependency map

**Imports of the old components**
- `FactsPanel` (old accordion): `AssessmentAppendix.tsx:16` (standalone Part A when
  the flag is off) and `AssessmentReport.tsx:30` (Overview, `<FactsPanel facts
  generated embedded />` at :1353, a purpose-built flat read-only variant).
- `AppendixTable`: `AssessmentAppendix.tsx:8` (standalone Part B when the flag is
  off), `AssessmentReport.tsx:31` (Overview, `readOnly embedded` at :1379-1386),
  and, decisive for Phase 3: `ChecklistV2.tsx:8` imports `StatusControl` and
  `RowDetail` FROM `AppendixTable`. The V2 checklist is built on primitives that
  live inside the old file. `AppendixTable.tsx` can therefore never be deleted
  outright; at most its top-level table component could be, later, by moving
  StatusControl/RowDetail out. Not in this run.
- `FactsPanelV2`: `AssessmentAppendix.tsx:17` + its dom test.
- `ChecklistV2`: `AssessmentAppendix.tsx:18` + its dom test.

**The `appendixV2` flag**
- Read once: `AssessmentAppendix.tsx:61` (`searchParams.get('appendixV2') === '1'`).
- Branches: `:401` (FactsPanelV2 vs FactsPanel) and `:436` (ChecklistV2 vs
  AppendixTable). No code ever SETS the flag (grep confirms; the only other hit is
  a localStorage key name in `v2/hooks.ts:32`, unrelated).

**Overview embedded usage** (audit was right)
- Appendix 1 card mounts old `FactsPanel` with `embedded` (flat, no frame) at :1353.
- Appendix 2 card mounts old `AppendixTable` with `readOnly embedded` at :1379.
- Both queries feeding them (`report-chart-snapshot` :253, `appendix-download`
  :265) use `refetchOnMount: 'always'` with load-bearing comments: the freshness
  matters on the return-from-edit path (edit pages save, then navigate back).
  The return navigations are `AssessmentAppendix.tsx:476` and
  `StructureChartStep.tsx:832, :844`, all plain `navigate('/assessment-report/id')`.

**V2 read-only capability**
- `FactsPanelV2`: YES, natively. `editable = !!onChange` (FactsPanelV2.tsx:53-54);
  omitting `onChange` is the read-only mode.
- `ChecklistV2`: NO read-only prop. Its rows always render the editable
  `StatusControl`; threading `readOnly` through would touch the A-grade component.
- `SectionRow`: no action slot (an Edit button cannot sit on the row) and
  `needReview` is required. Two additive, backward-compatible props are needed to
  reuse it for the Overview cards: `action?: ReactNode` and `needReview?: number`
  (chip hidden when undefined). This is wiring, not redesign.

## Decisions

1. **Overview disclosure cards mount the OLD embedded variants, lazy.** The brief
   prefers V2 read-only "if clean". It is not clean: FactsPanelV2/ChecklistV2 are
   full master-detail workbenches (page digest + 420px selection rail) designed for
   the standalone step, not for an embedded preview inside a card; ChecklistV2 has
   no readOnly mode; and adapting either means rearchitecting A-grade components,
   which the brief forbids. The old `FactsPanel embedded` and `AppendixTable
   readOnly embedded` are purpose-built for exactly this context. They now mount
   only when the card is expanded, which removes their cost from a plain visit.
2. **Phase 3 outcome: RETAIN both old files, no longer the standalone default.**
   Reasons: (a) the Overview still mounts both embedded variants; (b) ChecklistV2
   imports StatusControl/RowDetail from AppendixTable.tsx. Deleting either file
   would break imports. This is the brief's sanctioned fallback.
3. **SectionRow gets two optional props** (`action`, optional `needReview`), no
   visual change for existing callers. Used by the four new Overview cards so the
   disclosure primitive stays one component.
4. **Refetch fix**: replace `refetchOnMount: 'always'` with explicit
   `queryClient.invalidateQueries` at the three return-to-overview navigations
   (appendix Done button, structure save/continue-from-overview), and raise
   staleTime (5 min) on both queries. Plain revisits reuse cache; the edit path
   stays fresh via invalidation, honouring the original comments' intent.
5. **Outcome stated once**: keep the cover summary (always visible, at-a-glance)
   and drop the in-memo medallion (:1258-1268). The memo prose itself opens with
   the outcome; the medallion was the duplicate.
6. **Generated timestamp once**: keep the memo-rail value (:1224); the Generate
   card keeps only a bare "Generated" check state (status, not the fact) per the
   brief ("keep the memo-rail one only").
7. **Memo measure**: apply 68ch via `cn(MEMO_PROSE_CLASS, 'max-w-[68ch]')` in the
   Overview only. `cn` (tailwind-merge) is required because MEMO_PROSE_CLASS
   carries `max-w-none` and class order alone does not win in Tailwind.
8. **Confirm-guard visibility** (named in Phase 1's regression list): the reason
   currently lives only in a disabled button's `title`, which never shows. Added
   as a visible inline line above the footer on the checklist page. Kept in the
   page, not in the V2 components.

## Phase outcomes (run results)

- **Phase 1** (`5940ae8`): V2 is the unconditional default for Part A + Part B;
  the `appendixV2` flag is gone. Confirm-guard reason now renders as a visible
  line above the checklist footer. Regression gate: tsc clean; FactsPanelV2 (14),
  ChecklistV2 (5), confirmGuard (5), relevance (4) all green. The refine-safe
  reasoning editor is RowDetail, reused unchanged by V2. Status colours come from
  the shared tone engine remapped in Goal A (risk=amber, insufficient=slate).
- **Phase 2** (`095095a`): Overview decomposed. Memo only long-form; four
  SectionRow disclosure cards (collapsed by default, per-session persisted,
  children mount on expand); footer-centre section nav; jump-to-missing-
  explanation opens the responses card first; memo capped at 68ch via cn();
  outcome medallion removed (cover keeps it); Generate card shows a bare
  "Generated" check (timestamp only in the memo rail); both heavy queries lost
  `refetchOnMount:'always'` (staleTime 5 min) with invalidation moved to the
  appendix Done button and the structure save/skip handlers. Full suite 1170
  tests green after the change.
- **Phase 3**: RETAIN decision confirmed by re-grep. Final import state:
  `FactsPanel` <- AssessmentReport only (embedded, inside the collapsed card);
  `AppendixTable` <- AssessmentReport (readOnly embedded) + ChecklistV2
  (StatusControl/RowDetail). Nothing ships either as a standalone default.
  Deleting them would break the Overview preview and the V2 checklist itself.

## Not verified live
The dev-server session was logged out during the run (Supabase auth), so the
decomposed Overview and the V2-default appendix were gated on tsc + the full
1170-test suite, not on a live click-through. Recommend one logged-in pass:
open a finished assessment's overview (cards collapsed, nav jumps, memo 68ch),
expand both appendix cards, and walk Edit -> change -> Done, return to overview
to see the invalidation-driven refresh.

## Audit line refs that were wrong or moved
- (running list, updated per phase)
- `FactsPanel` "hideRegister/hideTransactions" props: do not exist. The embedded
  variant is a single `embedded` boolean (plus `generated`). Decision 1 unaffected.
- Overview structure section is `:1286-1330` as audited; appendix cards `:1334-1356`
  and `:1360-1389` confirmed; responses `:1393-1439` confirmed; queries `:253-271`
  (audit said :257/:269, close enough); prose wrapper `:1271` confirmed; outcome
  medallion `:1258-1268` confirmed; generate-card timestamp `:1150-1155` (audit
  said :1153); memo-rail generated `:1222-1225` (audit said :1224).
