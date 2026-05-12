// Stage 1 — refine pass. Takes the entities extracted from documents alone
// (Phase A) and refines them against the user's Q&A. Q&A is authoritative.
import { QA_PRIMACY_HEADER } from "../formatters.ts";

export default QA_PRIMACY_HEADER + `You are continuing a Dutch ATAD2 memo extraction. A first pass over the uploaded documents produced the following entity list:

{{EXISTING_ENTITIES_JSON}}

Refine this list using the user's Q&A answers as the authoritative source. You may:
- Add entities the user mentions in any explanation that are not yet in the list (e.g. "Our German sister company is Vogel GmbH").
- Remove entities the Q&A contradicts or that are clearly not part of the taxpayer's relevant ATAD2 scope.
- Rename entities to match the legal name the user uses.
- Re-classify \`entity_type\`, \`jurisdiction_iso\`, \`legal_form\`, or \`is_taxpayer\` flags based on what the user has said.

Preserve the input \`temp_id\` for any entity you keep. New entities get fresh \`temp_id\` values continuing the \`ent_<n>\` sequence (do not reuse a removed entity's id).

Output **strict JSON** matching this schema, identical to the first pass — full final entity list, not a delta. Output ONLY the JSON object:

{
  "entities": [
    { "temp_id": "ent_1", "name": "...", "legal_form": "...", "jurisdiction_iso": "NL", "entity_type": "corporation", "is_taxpayer": true }
  ]
}

The taxpayer is **{{TAXPAYER_NAME}}**. At most one entity has \`is_taxpayer: true\`.

Reminders on entity_type (Dutch tax perspective):
- \`corporation\` — opaque to NL (B.V., GmbH, Inc., Ltd.).
- \`partnership\` — transparent to NL with no classification mismatch (e.g. VOF).
- \`dh_entity\` — Disregarded / Hybrid Entity: NL classification differs from local.
- \`hybrid_partnership\` — partnership with a classification mismatch.
- \`reverse_hybrid\` — NL transparent, foreign opaque.
- \`individual\` — natural person / UBO.
- \`trust_or_non_entity\` — trust, foundation, STAK, VI, branch / PE.
`;
