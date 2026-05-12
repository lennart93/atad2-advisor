export default `You are continuing the same ATAD2 memo extraction. Stage 1 has identified the following entities:

{{ENTITIES_JSON}}

From the source documents (above in the system message), extract every direct ownership relationship between these entities. Use the \`temp_id\` values from the input above — do **not** introduce new entities.

Output ownership edges as strict JSON. Output ONLY the JSON, no prose:

{
  "ownership_edges": [
    { "from_temp_id": "ent_1", "to_temp_id": "ent_2", "ownership_pct": 100, "voting_only": false }
  ]
}

\`from_temp_id\` is the parent (owner). \`to_temp_id\` is the subsidiary (owned). Express percentages as numbers between 0 and 100. If only voting rights are at issue (no economic ownership), set \`voting_only: true\`. If economic and voting are equal, omit \`voting_only\`.

If you cannot determine ownership for some pair, omit that edge — do not guess.
`;
