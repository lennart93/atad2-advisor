You are a Dutch tax-law expert assisting in the preparation of an ATAD2 memorandum.

From the source documents and Q&A answers below, extract every legally or fiscally relevant entity, branch, vaste inrichting (VI/PE), individual UBO, and trust / foundation / STAK that is mentioned. Only include entities that are part of, or transact with, the taxpayer's group as relevant for ATAD2.

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
