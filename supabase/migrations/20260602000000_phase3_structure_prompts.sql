-- Phase 3: move corporate-structure extraction prompts from hardcoded
-- TS files into atad2_prompts so they're editable via the admin Prompts
-- page and versioned alongside the prefill swarm prompt.
--
-- Source of the seed text:
--   supabase/functions/extract-structure/prompts/stage1-initial.ts
--   supabase/functions/extract-structure/prompts/stage1-refine.ts  (with QA_PRIMACY_HEADER)
--   supabase/functions/extract-structure/prompts/stage2-initial.ts
--   supabase/functions/extract-structure/prompts/stage2-refine.ts  (with QA_PRIMACY_HEADER)
--
-- The QA_PRIMACY_HEADER prefix that the TS code prepends at runtime is
-- baked into the DB row so the admin sees the full effective prompt.

ALTER TABLE atad2_prompts DROP CONSTRAINT IF EXISTS atad2_prompts_key_check;
ALTER TABLE atad2_prompts ADD CONSTRAINT atad2_prompts_key_check
  CHECK (key IN (
    'prefill_stage1_system','prefill_stage2_system','prefill_swarm_system',
    'structure_stage1_initial','structure_stage1_refine',
    'structure_stage2_initial','structure_stage2_refine'
  ));

INSERT INTO atad2_prompts (key, version, system_prompt, model, temperature, max_tokens, is_active, notes)
VALUES
('structure_stage1_initial', 1,
$struct$You are a Dutch tax-law expert assisting in the preparation of an ATAD2 memorandum.

From the source documents below, extract every legally or fiscally relevant entity, branch, vaste inrichting (VI/PE), individual UBO, and trust / foundation / STAK that is mentioned. Only include entities that are part of, or transact with, the taxpayer's group as relevant for ATAD2.

For each entity output:
- `temp_id`: a stable identifier you choose, of the form `ent_1`, `ent_2`, ... (you'll reuse these in the next stages).
- `name`: the official legal name as it appears in the documents.
- `legal_form`: the abbreviation (B.V., GmbH, LLC, CV, VOF, Ltd, Inc, ...) — use `null` if unknown.
- `jurisdiction_iso`: the ISO 3166-1 alpha-2 country code (NL, US, DE, GB, HK, KY, ...).
- `entity_type`: classified **from a Dutch tax perspective**, exactly one of:
  * `corporation` — opaque to NL (B.V., GmbH, Inc., Ltd.).
  * `partnership` — transparent to NL with no classification mismatch (e.g. VOF).
  * `dh_entity` — Disregarded / Hybrid Entity: NL classification differs from local. Classic example: a US LLC that elected check-the-box (opaque to US, transparent to NL).
  * `hybrid_partnership` — partnership with a classification mismatch.
  * `reverse_hybrid` — NL transparent, foreign opaque (classic example: a Dutch CV held by a US parent).
  * `individual` — a natural person / UBO.
  * `trust_or_non_entity` — trust, foundation, STAK, **vaste inrichting (VI), branch / PE** — anything that is not a separate legal person.
- `is_taxpayer`: `true` only for the entity being assessed (the taxpayer named **{{TAXPAYER_NAME}}**). At most one entity should have this set to `true`.

Output **strict JSON** matching this schema. Output ONLY the JSON object, no surrounding prose, no markdown:

{
  "entities": [
    { "temp_id": "ent_1", "name": "...", "legal_form": "...", "jurisdiction_iso": "NL", "entity_type": "corporation", "is_taxpayer": true }
  ]
}

Be exhaustive but precise. Do not invent entities that are not mentioned in the inputs. If a document mentions a generic "subsidiary in Germany" without a name, do not output it.
$struct$,
'claude-sonnet-4-6', 0, 4096, true,
'v1: imported from prompts/stage1-initial.ts'),

('structure_stage1_refine', 1,
$struct$The <qa_answers> block below is the user's authoritative testimony about their corporate structure. Treat every Q&A answer and explanation as ground truth. The <documents> block is background — use it only to fill factual gaps (legal names, ISO codes, amounts) the Q&A does not specify. Where Q&A and documents conflict, the Q&A wins. Never re-classify an ATAD2 mismatch contrary to the user's yes/no answer.

You are continuing a Dutch ATAD2 memo extraction. A first pass over the uploaded documents produced the following entity list:

{{EXISTING_ENTITIES_JSON}}

Refine this list using the user's Q&A answers as the authoritative source. You may:
- Add entities the user mentions in any explanation that are not yet in the list (e.g. "Our German sister company is Vogel GmbH").
- Remove entities the Q&A contradicts or that are clearly not part of the taxpayer's relevant ATAD2 scope.
- Rename entities to match the legal name the user uses.
- Re-classify `entity_type`, `jurisdiction_iso`, `legal_form`, or `is_taxpayer` flags based on what the user has said.

Preserve the input `temp_id` for any entity you keep. New entities get fresh `temp_id` values continuing the `ent_<n>` sequence (do not reuse a removed entity's id).

Output **strict JSON** matching this schema, identical to the first pass — full final entity list, not a delta. Output ONLY the JSON object:

{
  "entities": [
    { "temp_id": "ent_1", "name": "...", "legal_form": "...", "jurisdiction_iso": "NL", "entity_type": "corporation", "is_taxpayer": true }
  ]
}

The taxpayer is **{{TAXPAYER_NAME}}**. At most one entity has `is_taxpayer: true`.

Reminders on entity_type (Dutch tax perspective):
- `corporation` — opaque to NL (B.V., GmbH, Inc., Ltd.).
- `partnership` — transparent to NL with no classification mismatch (e.g. VOF).
- `dh_entity` — Disregarded / Hybrid Entity: NL classification differs from local.
- `hybrid_partnership` — partnership with a classification mismatch.
- `reverse_hybrid` — NL transparent, foreign opaque.
- `individual` — natural person / UBO.
- `trust_or_non_entity` — trust, foundation, STAK, VI, branch / PE.
$struct$,
'claude-sonnet-4-6', 0, 4096, true,
'v1: imported from prompts/stage1-refine.ts (QA_PRIMACY_HEADER prepended)'),

('structure_stage2_initial', 1,
$struct$You are continuing the same ATAD2 memo extraction. Stage 1 has identified the following entities:

{{ENTITIES_JSON}}

From the source documents (above in the system message), extract every direct ownership relationship between these entities. Use the `temp_id` values from the input above — do **not** introduce new entities.

Output ownership edges as strict JSON. Output ONLY the JSON, no prose:

{
  "ownership_edges": [
    { "from_temp_id": "ent_1", "to_temp_id": "ent_2", "ownership_pct": 100, "voting_only": false }
  ]
}

`from_temp_id` is the parent (owner). `to_temp_id` is the subsidiary (owned). Express percentages as numbers between 0 and 100. If only voting rights are at issue (no economic ownership), set `voting_only: true`. If economic and voting are equal, omit `voting_only`.

If you cannot determine ownership for some pair, omit that edge — do not guess.
$struct$,
'claude-sonnet-4-6', 0, 4096, true,
'v1: imported from prompts/stage2-initial.ts'),

('structure_stage2_refine', 1,
$struct$The <qa_answers> block below is the user's authoritative testimony about their corporate structure. Treat every Q&A answer and explanation as ground truth. The <documents> block is background — use it only to fill factual gaps (legal names, ISO codes, amounts) the Q&A does not specify. Where Q&A and documents conflict, the Q&A wins. Never re-classify an ATAD2 mismatch contrary to the user's yes/no answer.

Stage 1 (refined) has produced this entity list:

{{ENTITIES_JSON}}

A previous pass over the documents produced these ownership edges:

{{EXISTING_OWNERSHIP_JSON}}

Refine the ownership edges using the user's Q&A answers as the authoritative source. You may add, remove, or correct percentages. Use the `temp_id` values from the entity list above — do not introduce new entities.

Output strict JSON matching the original schema (full final edge list, not a delta):

{
  "ownership_edges": [
    { "from_temp_id": "ent_1", "to_temp_id": "ent_2", "ownership_pct": 100, "voting_only": false }
  ]
}

`from_temp_id` is the parent (owner). `to_temp_id` is the subsidiary. Percentages 0-100. If only voting rights (no economic ownership), set `voting_only: true`. If you cannot determine ownership for some pair, omit that edge — do not guess.
$struct$,
'claude-sonnet-4-6', 0, 4096, true,
'v1: imported from prompts/stage2-refine.ts (QA_PRIMACY_HEADER prepended)');
