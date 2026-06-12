# Appendix Part A as a funnel - design

**Status:** approved by Lennart (2026-06-09).
**Branch:** feat/technical-appendix.
**Scope:** the appendix "Part A · Facts & relationships" page (FactsPanel + AssessmentAppendix facts sub-page), the facts data model, the generate-appendix facts prompt, and the Part A portion of the print/memo export.

## Problem

The Facts page stacks five exhibits (entity register, relatedness, acting together, classification, transaction map) and shows everything for every entity: rows of dropdowns, all-entity classification, domestic fiscal-unity flows. The result is information overload and no storyline. The page must become a funnel: start with the full group, narrow to what is ATAD2-relevant, and state explicitly when nothing relevant remains ("no hybrid qualification differences identified"), because the absence of issues is itself the product.

## Decisions (fixed)

1. **Audience: the client.** The page is the working copy of the appendix that supplements the memo. What the advisor sees and edits in the app is, section for section, what the export contains. It stays an **annex with tables**, not a second memo: per section at most one or two connective sentences, tables carry the content.
2. **Transaction relevance is AI-proposed, advisor-controlled.** The facts model marks each transaction relevant or not with a short reason; the advisor can flip any marking and the flip survives regeneration.
3. **Accounted summarization.** Items that fall out of the funnel are not silently dropped. They collapse into one summary line per category with count and reason (expandable in the app, restorable). The export carries the summary line only.
4. **Conclusions are deterministic; prose is AI.** The summary flags (cross-border related-party flows yes/no+count, hybrid qualification differences yes/no+count, acting-together clusters at likely or higher yes/no+count) are computed in code from the facts, never written by the model. The AI pre-generates one short intro sentence per section (editable, like the acting-together rationales). No sentence available -> table only.

## Page structure (app and export, identical order)

### A. Summary strip (top)
Compact table of the deterministic conclusion flags, each linking to its section:

| Flag | Source |
|---|---|
| Cross-border flows with related parties: N identified / none | relevant transactions where the two parties' (effective) jurisdictions differ |
| Hybrid qualification differences (NL vs local): N / none identified | classification rows of in-scope entities with hybrid=true, plus any entity whose NL qualification (transparent vs non-transparent) differs from its local/home qualification |
| Acting-together group: N clusters considered likely / none considered likely | clusters with likelihood in {likely, highly_likely} and not excluded |

Rendered as a checklist-style table with a neutral marker per row (no traffic-light colours needed in v1; the wording carries the verdict). No prose.

### B. Section 1 - The group and the taxpayer
Entity register, slimmed:
- The taxpayer (E1) and its fiscal-unity members render as a visually separated block at the top of the table (accent border + existing fiscal-unity badge). The taxpayer is unmistakable.
- Prominent columns: `#`, `Entity`, `Jurisdiction` (flag + country name), `Role`.
- `Type` and `NL tax status` stay but de-emphasized: rendered as quiet text; clicking the value opens the existing picker (jurisdiction picker / selects) in place. No permanent dropdown rows.
- Hidden ("mark irrelevant") entities: existing behaviour, plus they join the accounted line ("N entities marked not relevant: ...").

### C. Section 2 - Related parties
- Table of related parties only (related=true, outside the fiscal unity): `Entity`, `via` (when indirect), `%`. Non-related group entities do not appear here; they are covered by Section 4's closing line.
- Below it, the acting-together block as an add-on ("on top of direct relatedness"): the existing cluster cards with the 5-level likelihood selector and editable rationale.
- **Export rule:** only clusters with likelihood likely or highly_likely (and not excluded) appear in the export; the others are summarized in the accounted line ("M further candidate groupings were considered and assessed as unlikely"). The app always shows all clusters.
- Improving acting-together detection quality itself is out of scope here.

### D. Section 3 - Relevant flows
- Transactions table filtered to `relevant === true`: `#`, `Flow` (from -> to), `Type`, `Instrument`, `Article(s)`, `Why relevant` (short reason).
- New per-transaction fields: `relevant: boolean`, `relevanceReason: string | null` (AI-proposed). Advisor can flip relevance from both directions (a flipped transaction moves between the table and the accounted group); a flip sets source='edited' and is preserved by mergeFacts (existing from|to|kind key).
- Non-relevant transactions group by reason into accounted lines with counts (e.g. "8 flows within the fiscal unity; not relevant because they occur within the same taxpayer"), expandable in the app, summary-only in the export.
- The AI receives the funnel rules in the prompt: flows between the taxpayer (the fiscal unity as a whole) and related parties / likely acting-together groups are relevant, with cross-border character weighing heavily; purely domestic intra-fiscal-unity flows are not relevant.

### E. Section 4 - Classification of the relevant entities
- In-scope entities: every entity that is a party to at least one relevant transaction, plus every entity with a hybrid=true classification row. The taxpayer is always in scope.
- Columns: `Entity`, `NL qualification` (transparent / non-transparent, derived from NL tax status as today), `Local qualification` (from facts.classifications homeClass for that entity), `Mismatch?` (the hybrid flag).
- This surfaces the home/source classification data the model already returns but the page never showed.
- Closing accounted line: "The remaining N group entities are non-transparent from a Dutch perspective and are not party to a relevant flow."

### F. Connective sentences
- `facts.narratives: { register?: N; related?: N; flows?: N; classification?: N }` with `N = { text: string; source: 'ai' | 'edited' }` - one or two sentences each, AI-generated in the facts pass, editable in the app (same UX as the acting-together rationale textarea). mergeFacts keeps a key whose source is 'edited' and refreshes the others from the new AI output.
- Missing/empty narrative -> render nothing (table only). Narratives never carry conclusions; the strip does.

## Backend

- **Prompt `appendix_facts_system` -> v8.** Additions: per-transaction `relevant` + `relevanceReason` (with the funnel rules spelled out), and a `narratives` object with the four section sentences (English, measured, no em-dashes, max 2 sentences each, grounded only on the inputs). Everything else unchanged from v7.
- **factsSchemas.ts:** tolerant additions only - `relevant: z.boolean().nullish()`, `relevanceReason: z.string().nullish()` on transactions; `narratives: z.object({...}).partial().nullish()`.
- **buildFacts:** default `relevant` to `true` when the model omits it (visible-by-default is the safe failure mode); carry `relevanceReason ?? null`; carry narratives with missing keys omitted.
- **mergeFacts:** preserve advisor-edited narratives (per key, when edited) and advisor-flipped transaction relevance (already covered by the existing edited/confirmed transaction preservation; extend the preserved fields with relevant/relevanceReason).
- **Conclusion flags are computed, not stored:** a pure function over AppendixFacts, implemented twice (src/lib/appendix mirror + Deno export builder) with unit tests on the frontend side, following the existing frontend+Deno mirror pattern.
- The prompt version bump automatically invalidates the facts reuse cache (facts_input_hash includes the prompt version) - intended.
- **Generated types:** `facts` is a jsonb column; no DB schema change is needed for the new fields. Only the two prompt/notes migration files.

## Export (print + memo block)

- printAppendix Part A and appendixMemoBlock follow the same A-F order: summary strip table, then the four sections, each as heading + optional narrative sentence + table + accounted line(s).
- Acting-together export rule (likely+ only) applies here.
- Existing per-section exclude (excludedSections) and per-page skip behaviour unchanged.

## Edge cases

- No relevant flows at all -> Section 3 is just the accounted line; the strip reads "none identified". That is the intended "no problem" story, not an error.
- Facts not generated / no entities -> existing empty state (unchanged).
- Old sessions (facts without the new fields) -> transactions default to relevant=true without reason; no narratives; strip computes from what exists. Nothing breaks.
- Advisor flips a relevance marking -> the strip recomputes immediately (pure function of facts state).

## Out of scope

- Acting-together detection quality (separate follow-up).
- Part B (article checklist), structure chart, memo v4 placeholder wiring.
- Traffic-light colouring of the summary strip.

## Testing

- Unit tests (Vitest, src/lib/appendix): conclusion-flag derivation (incl. cross-border detection and the hybrid definition above), relevance filtering + accounted grouping, mergeFacts preservation of flipped relevance and edited narratives, in-scope entity selection for Section 4.
- Build green; existing appendix tests stay green.
- Live check on a real session after edge deploy (facts v8 populates relevance + narratives).
