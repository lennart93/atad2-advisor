Continue the ATAD2 memo extraction. Stage 1 entities and stage 2 ownership relationships are below:

ENTITIES:
{{ENTITIES_JSON}}

OWNERSHIP:
{{OWNERSHIP_JSON}}

From the source documents and Q&A answers, extract every payment / loan / royalty / dividend / service-fee / management-fee flow between the entities above. For each transaction, classify whether it represents an ATAD2 hybrid mismatch (D/NI = deduction without inclusion, or DD = double deduction) **from a Dutch tax perspective**, and cite the relevant ATAD2 article (e.g. `12aa`, `12ab`, ...).

Output ONLY this JSON, no prose:

{
  "transactions": [
    {
      "from_temp_id": "ent_1",
      "to_temp_id": "ent_2",
      "transaction_type": "loan",
      "amount_eur": 5000000,
      "label": "Loan facility",
      "is_mismatch": true,
      "mismatch_classification": "D/NI",
      "mismatch_atad2_article": "12aa"
    }
  ]
}

Direction (`from`→`to`) follows the **money flow** (payer → receiver). Convert all amounts to EUR; round to whole euros. Set `amount_eur: null` if not stated.

If a flow has no apparent ATAD2 implication, set `is_mismatch: false` and omit the mismatch fields. Do not over-classify — if it's clearly an arm's-length payment with no classification mismatch, it is not an ATAD2 mismatch.
