# Memo review pass (Fable 5 rewrite) — design

Date: 2026-07-03. Status: `review-memo` edge function DEPLOYED + smoke/E2E-tested on
the VM. Migration applied. Remaining: add one HTTP node to the n8n
`generate-report` workflow so the memo actually passes through it (see Activation).

## Goal

The memo is produced by one large `memo_system` prompt in n8n. Add a second pass
that rewrites the finished memo so it reads as if written by a fluent Dutch tax
specialist in English: precise, plain, coherent, no awkward phrasing, and with
in-line references to the two appendices where they genuinely help. This is a full
rewrite, not a redline.

## Where it runs

A standalone `review-memo` edge function that n8n calls with one HTTP node, AFTER
memo generation and BEFORE its existing DB insert. This was chosen over folding the
review into `n8n-report` because, operationally, reports today do NOT flow through
`n8n-report`: that function is deployed but fails closed (HMAC on, `N8N_SIGNING_SECRET`
missing), so n8n writes to `atad2_reports` directly. The hybrid keeps n8n as the
inserter (no HMAC switch, no fail-closed 401 risk, matches the live path) while the
tested guard runs server-side (no duplication of guard logic into n8n JS).

Flow:

```
n8n generate-report (memo_system -> draft markdown)
  -> HTTP node POST review-memo { session_id, draft_markdown }:
       1. auth: Bearer must equal the service-role key
       2. load session taxpayer + appendix (facts + rows + skip flags) by session_id
       3. Fable 5 rewrites draft -> polish
       4. deterministic preservation guard
       5. returns { markdown, status, model, failures }  (writes nothing)
  -> n8n uses response.markdown as report_markdown in its existing insert
  -> AssessmentReport shows the polished memo (advisor can still edit)
  -> Download: parse-memo on the polished text -> DOCX + client-side appendices
```

Files: `supabase/functions/review-memo/` — `reviewMemo.ts` (pure, no Deno/network,
unit-tested), `fable.ts` (Fable 5 client; NB the Claude 5 family rejects the
`temperature` param, so none is sent), `index.ts` (HTTP endpoint + service-key auth).

Note: `report_md_raw` / `polish_status` are not written by this hybrid (n8n does the
insert and does not set them today). They remain on the table for a future move of
the review into the inserter, or for n8n to set if desired.

## Rewrite prompt

A tight editorial prompt (not a second mega-prompt) that reuses the same house
register `memo_system` v6 already enforces (conclusion-first paragraphs, banned
announcing/ranking openers, name the jurisdiction, "parent company of a fiscal
unity", define deemed payments/PE only when used). Hard preservation rules: do not
change any legal conclusion or its direction, entity name, number, date, currency,
percentage, or statutory reference; keep the exact section headers and `---`
dividers; markdown only; no em dashes; keep the "we" adviser voice.

### Appendix references

The appendices are built client-side as Word tables, numbered as in
`memoAppendices.ts`:
- Appendix 1: entities by `#` = `FactEntity.id` (`E1`, `E2`, ...) and transactions
  by `#` = `TransactionItem.id` (`T1`, `T2`, ...).
- Appendix 2: article-by-article checklist.

The prompt is fed the actual entity and transaction ids + labels, so it references
real numbers: `(see Appendix 1, no. E2)`, `(see Appendix 1, transaction T1)`,
`(see Appendix 2, art. 12aa)`. It is told never to invent ids or article numbers.
Only appendices that will actually render are offered (driven by `facts_skipped` /
`checklist_skipped`); a later flip of those flags is the one known edge case where a
reference could dangle.

## Preservation guard (fail-safe to the draft)

After the rewrite (and a deterministic cleanup that strips em dashes and any
appendix reference to an absent appendix or unknown id), the polish must pass:

- section headers: same ordered set as the draft (else `parse-memo` breaks);
- `---` divider count unchanged;
- every number token in the draft is still present;
- every statutory article core (`12aa`, `12ac`, ...) still present;
- critical keywords present where the draft had them (`EUR`, `D/NI`, `DD`, `ATAD2`);
- every entity name that appeared in the draft still appears;
- no `{{`/`}}` placeholder leakage;
- length within 0.5x–1.4x of the draft.

On failure: one retry with the failures fed back. Still failing → store the draft
unchanged with `polish_status = 'skipped'`. A memo is never blocked or shipped
broken; the worst case is an un-polished but correct memo.

## Data changes

`atad2_reports` gains two nullable columns (migration
`20260703120000_report_review_columns.sql`, applied as `supabase_admin`):
- `report_md_raw text` — the pre-review draft, for audit and rollback;
- `polish_status text` — `polished` | `skipped` | `error`.

`report_md` still holds the shown/exported text (polished, or the draft when
skipped), so everything downstream is unchanged. Types added by hand in
`src/integrations/supabase/types.ts` (no Supabase CLI on the self-hosted instance).

## Toggle and safety

`MEMO_REVIEW_ENABLED=false` (env) disables the pass without a redeploy; a missing
`ANTHROPIC_API_KEY` skips it gracefully. Residual risk of a full rewrite: subtle
semantic drift within a sentence that the guard cannot catch (it catches dropped
facts, not paraphrase). Mitigated by low temperature, the "do not change substance"
rule, and the advisor reviewing the memo on screen before download.

## Deploy status (done on 2026-07-03)

1. DONE - migration `20260703120000_report_review_columns.sql` applied as
   `supabase_admin` (both columns present).
2. DONE - `review-memo` edge function deployed to
   `/root/supabase-docker/volumes/functions/review-memo/`, container restarted,
   md5 verified in-container. `ANTHROPIC_API_KEY` confirmed visible to the function.
3. DONE - smoke test (401 no/bad auth, 400 empty draft/session) + E2E on session
   `S4 Energy BV`: `status: polished`, `model: claude-fable-5`, guard passed.
4. `types.ts` columns added by hand (in the frontend build).

## Activation (the one remaining step, Lennart's n8n)

Add an HTTP Request node to the n8n `generate-report` workflow, between the memo
generation node and the DB insert:

- Method: POST
- URL: `https://api.atad2.tax/functions/v1/review-memo`
- Headers: `apikey: <service_role key>`, `Authorization: Bearer <service_role key>`,
  `Content-Type: application/json`
- Body (JSON): `{ "session_id": "{{session_id}}", "draft_markdown": "{{the generated memo markdown}}" }`
- Then feed `{{ $json.markdown }}` from the response into the existing insert as
  `report_markdown`.

The node is fail-safe: on any error it returns HTTP 200 with the untouched draft and
`status: "skipped"`, so a bad Fable call never blocks report generation. Off-switch:
set env `MEMO_REVIEW_ENABLED=false` on the edge-functions container.
