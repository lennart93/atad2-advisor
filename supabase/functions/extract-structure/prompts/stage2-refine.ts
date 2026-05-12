import { QA_PRIMACY_HEADER } from "../formatters.ts";

export default QA_PRIMACY_HEADER + `Stage 1 (refined) has produced this entity list:

{{ENTITIES_JSON}}

A previous pass over the documents produced these ownership edges:

{{EXISTING_OWNERSHIP_JSON}}

Refine the ownership edges using the user's Q&A answers as the authoritative source. You may add, remove, or correct percentages. Use the \`temp_id\` values from the entity list above — do not introduce new entities.

Output strict JSON matching the original schema (full final edge list, not a delta):

{
  "ownership_edges": [
    { "from_temp_id": "ent_1", "to_temp_id": "ent_2", "ownership_pct": 100, "voting_only": false }
  ]
}

\`from_temp_id\` is the parent (owner). \`to_temp_id\` is the subsidiary. Percentages 0-100. If only voting rights (no economic ownership), set \`voting_only: true\`. If you cannot determine ownership for some pair, omit that edge — do not guess.
`;
