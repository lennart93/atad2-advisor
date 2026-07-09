# Appendix V2 — resting-state + master-detail: implementation plan

Date: 2026-07-08
Scope: **both appendices, integrally** — Part A "Facts & relationships" (appendix 1, all three sections)
and Part B "Condition assessment" (appendix 2, all sections). Behind a `?appendixV2=1` route flag until
the old accordion UI is deleted.

Design source: the appendix-redesign spec (resting state + master-detail). This plan maps that spec onto
the real components and sets a safe build order. It is **presentation-only**: no data-model, Supabase,
memo, or auto-analysis changes (spec §12).

---

## 0. Current shape (what we are refactoring)

- **One page component**, `src/pages/AssessmentAppendix.tsx`, switches on a `page` prop:
  `page="facts"` → Part A, `page="checklist"` → Part B. Routes: `App.tsx:82-83`.
- **Part A = `src/components/appendix/FactsPanel.tsx`** (1716 lines). Three `<Exhibit>` sections, each an
  always-open collapsible card with **per-row click-to-expand accordions** and inline `Select`/`textarea`
  editors:
  - §1 "The group and the taxpayer" — entity table, `renderEntityRow` (560-1003), detail body 743-1000.
  - §2 "Acting together" — delegates to `ActingTogetherSection.tsx`.
  - §3 "Intra-group transactions" — `renderTxRow` (1097-1368), detail body 1189-1365.
- **Part B = `src/components/appendix/AppendixTable.tsx`** (766 lines). Skeleton-driven sections
  (`src/lib/appendix/skeleton.ts`, 8 sections incl. art. 2), per-row status pill (`StatusControl`),
  inline reasoning editor + Source panel + visibility toggle (`RowDetail` 452-571). Findings auto-expand
  (594-608).
- **Autosave (reused unchanged):**
  - Part A: everything → `onChange` → `handleFactsChange` (`AssessmentAppendix.tsx:281-287`) → `saveFacts`
    (whole `facts` JSONB, serialized per keystroke via `pendingFactsSave`/`flushFactsSave`).
  - Part B: status/reasoning/exclusion → `onEdit`/`onToggleExclude` → `saveRowEdit` (whole `rows` JSONB +
    an `atad2_appendix_edits` audit row).
- **No feature flag exists.** Conventions to follow: route-param via `useSearchParams()` (`from=overview`
  at `AssessmentAppendix.tsx:53-56`); per-session localStorage `atad2:commentMode:${sessionId}`.
- **No appendix comment system exists.** The only "comment mode" is the questionnaire smart/always toggle.
  The spec's "comment mode must keep working" is therefore vacuously satisfied — nothing to preserve.
  (User confirmed: note it, build nothing.)

---

## 1. Shared model — `needsAttention`

New pure module `src/lib/appendix/needsAttention.ts` (+ `__tests__/needsAttention.test.ts`). One derived
flag per row type; hierarchy everywhere reads from these. All wrap existing helpers — no new logic.

- `txNeedsAttention(facts, t)` = `effTxStatus(facts, t) === 'needs'`. (Routine = `no_risk`. This is exactly
  today's `relevantTransactions` vs `noRiskTransactions` split.)
- `entityNeedsAttention(e, cls)` = `isForeignHomeStateOpen(e, cls)` (open home-state classification) OR
  missing jurisdiction OR unresolved qualification. (Reuses `conclusions.ts`.)
- `groupNeedsAttention(facts)` / `actingSectionNeedsAttention` = AI suggestions present but not adopted
  into a manual group, or "empty with candidates" (`actingTogetherCandidateCount >= 2` and no manual
  group). (Reuses `actingCandidates.ts`, `actingInClientReport`.)
- `conditionNeedsAttention(row, mootSet)` = `row.ungrounded` OR
  (`controlTypeFor(row, mootSet) === 'status'` && `rowTone(row.status, row.rowId)` ∈ {risk, caution}).
  (Exactly the existing Part B auto-expand rule, plus ungrounded.)
- `partADigest(facts)` → `{ entities, groups, transactions, needReview }` counts.
- `partBDigest(rows, mootSet)` → `{ conditions, needReview }`, and `sectionWorstStatus(rows)` per section.

A section is **verified/complete** when its flagged count is 0 → renders collapsed by default.

---

## 2. Shared components — `src/components/appendix/v2/`

Built on existing primitives only (no new deps, spec §12). Tokens only (spec §9).

- **`AppendixDigest.tsx`** — one 12-13px line under the page title. Counts (middot-joined) left;
  `● N need review` in accent right when N>0, click scrolls to first flagged row. No card/border.
- **`SectionRow.tsx`** — 44-48px header row: index (muted) + title + inline data summary + `(i)` popover
  (holds the old section intro paragraph, spec §8) + right side (`✓ Verified`/`Complete` or `N need review`
  in accent) + chevron. Open/closed persisted per assessment in localStorage
  (`atad2:appendixV2:sec:${sessionId}` → `{ [sectionKey]: boolean }`). Flagged sections default open;
  verified default collapsed.
- **`RolledUpGroup.tsx`** — muted line `✓ 5 transactions · no risk identified` + `Show`. Collapsed by
  default every load (no persistence). Expands to thin read-only rows, still clickable to open the panel.
- **`AppendixRowItem.tsx`** (the `Row`) — thin, fixed-height, 2-line max. Line 1: ID (muted) + primary
  label (`A → B` with arrow for tx, ellipsis-truncated) + right meta. Line 2 (optional, muted): the
  one-line flag reason. Eye icon on the right. No chevron, no inline controls. Selected = 2px left accent
  border + subtle tint. Row click opens/updates the panel.
- **`DetailPanel.tsx`** — the page-level rail shell. Desktop ≥1200px: sticky right rail ~420px, own scroll,
  reserved grid column so the list never reflows. Below 1200px: slide-over `Sheet` (existing shadcn/Radix
  Dialog primitive) + scrim. Header (`✕`, Esc), body slot, autosave (no save/cancel). One instance per page.
- **`useAppendixSelection.ts`** — page-level selected-row state `{ type, id } | null`, `select`, `close`,
  and ↑/↓/Enter/Esc keyboard handling scoped to the active list.
- **`useSectionOpenState.ts`** — the localStorage-backed section open/closed map.

**Panel body components** (one per row type; each is the *extracted* current expanded-detail body, so
behaviour is identical and edits fire the same `onChange`/`onEdit`):
- `TransactionDetail.tsx` ← `renderTxRow` detail (`FactsPanel.tsx:1189-1365`): parties/jurisdictions/
  type/instrument → flag banner → Assessment as key-value rows (the 5 characteristics) → `+ Add reasoning`
  → segmented `Auto | Needs assessment | No risk identified` + override reason.
- `EntityDetail.tsx` ← `renderEntityRow` detail (743-1000): relation + NL/home-state/foreign classification
  + reasoning + visibility/relevance controls.
- `GroupDetail.tsx` ← `ActingTogetherSection` `ManualGroupCard` editors (members/basis/target/reasoning/
  kept-internal).
- `ConditionDetail.tsx` ← `AppendixTable` `RowDetail` (452-571): flag banner + reasoning field + Source
  panel + visibility toggle.

---

## 3. Part A — `FactsPanelV2.tsx`

Container owns selection + section state, renders `AppendixDigest` + a two-column grid (left = sections,
right = sticky `DetailPanel`). All three sections converted:

- **§1 The group and the taxpayer.** Keep the existing register table (it already scans well), but remove
  the per-row chevron accordion — the whole row opens the entity in the panel. `SectionRow` summary =
  taxpayer/related counts; collapsed when nothing flagged. "Add entity" stays at the bottom, opens the
  panel in create mode.
- **§2 Acting together.** Each group = one `Row` (name/type, member chips, combined %); all editing in
  `GroupDetail`. Document suggestions collapse to one muted `RolledUpGroup` row ("1 suggestion from
  documents" → Use / Dismiss in place).
- **§3 Intra-group transactions.** `RolledUpGroup` = `noRiskTransactions`; flagged (`relevantTransactions`)
  visible beneath; `TransactionDetail` in the panel.

Wiring: `AssessmentAppendix.tsx` reads `appendixV2 = searchParams.get('appendixV2') === '1'` and renders
`appendixV2 ? <FactsPanelV2 …/> : <FactsPanel …/>`. The overview-embedded `<FactsPanel>` is untouched.

---

## 4. Part B — `ChecklistV2.tsx` (wraps a refactored table)

- Remove the 6-part status legend from the top; each status pill gets a tooltip instead (spec §6, §8).
- Each skeleton section → a `SectionRow` whose right side shows the worst status inside it.
- Within a section: `not_triggered` / `N/A` / confirmed conditions roll up (`RolledUpGroup`,
  "5 conditions · not triggered"); `triggered` / `insufficient_info` / `ungrounded` stay visible as rows
  with a status pill + one-line summary.
- The inline `ARTICLE 12aa(1)(b)` reasoning blocks, Source button, and "Visible to client" toggle move
  into `ConditionDetail` in the panel. The "Re-run analysis" banner is unchanged.
- Same `onEdit`/`onToggleExclude` autosave path; same `readOnly` support for the overview.

---

## 5. Build order (safe, incremental, all behind the flag)

1. **Primitives**: `needsAttention.ts` (+test), `AppendixDigest`, `SectionRow`, `RolledUpGroup`,
   `AppendixRowItem`, `DetailPanel`, `useAppendixSelection`, `useSectionOpenState`.
2. **Part A §3 transactions** first (proves the master-detail pattern end-to-end): `TransactionDetail`,
   `FactsPanelV2` shell rendering only §3 new + §1/§2 via existing `<FactsPanel hideTransactions>`.
   Add DOM test.
3. **Part A §1 entities** → `EntityDetail`, convert the register rows.
4. **Part A §2 acting together** → `GroupDetail`, convert group rows + suggestion rollup.
5. **Part B** → `ChecklistV2` + `ConditionDetail`, section rollups, pill tooltips, legend removal.
6. **Flag flip → delete** the old accordion code paths (`renderEntityRow`/`renderTxRow` details,
   `RowDetail`, the `hideTransactions` scaffold) and the flag (spec §10 Phase 3).

`FactsPanel` gets one small additive prop, `hideTransactions?: boolean`, used only by step 2's scaffold so
we never duplicate sections 1-2 mid-migration; it is removed at step 6.

---

## 6. Layout / no-jump

Left content column + right sticky rail in a CSS grid (`1fr 420px`, rail column always reserved so the
list never reflows when the panel opens/closes/swaps). Below 1200px the rail becomes a `Sheet` + scrim.
Transition ≤200ms ease-out. Sections 1-2 live in the same left column so the page-level rail aligns (spec §4).

---

## 7. Tests

- `needsAttention.test.ts` — every derived flag + digest counts (pure).
- `v2/__tests__/*.dom.test.tsx` (mirror `ActingTogetherSection.dom.test.tsx`): zero form controls at rest;
  `RolledUpGroup` collapsed by default; row-click opens panel; row-swap doesn't unmount the rail;
  Esc closes + clears selection; ↑/↓/Enter nav; a panel edit fires `onChange`/`onEdit` (autosave intact);
  verified section collapsed on load, flagged section open.
- `npm run build` + `vitest run` green before each flag-gated slice merges.

---

## 8. Acceptance (spec §11) — all in scope now

Zero form controls at rest ✓ · panel open/swap never shifts the list ✓ · one panel, Esc closes, ↑/↓/Enter ✓ ·
empty reasoning = `+ Add reasoning` link ✓ · no permanent instructional paragraphs (all in `(i)`) ✓ ·
WMC Part A well under half current height, all sections collapsed except one ✓ (achievable now that §1-§2
convert) · autosave / memo generation / client-visibility / suggestion flow unchanged ✓ · comment mode:
n/a (no appendix comment surface exists).

## 9. Out of scope (spec §12)

Data model, Supabase schema, memo generation, auto-analysis/suggestion engine, tab navigation,
color/typography. No new dependencies.
