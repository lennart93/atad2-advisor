// House form for legal-entity suffixes: no dots (e.g. "B.V." -> "BV"), so the
// structure chart, the appendix tables and the memo body all read the same way.
// Only dotted suffix forms are rewritten; already-undotted names are left as-is,
// and ordinary words are never touched.

const SUFFIX_REPLACEMENTS: ReadonlyArray<[RegExp, string]> = [
  [/\bB\.\s*V\.?/g, 'BV'],
  [/\bN\.\s*V\.?/g, 'NV'],
  [/\bC\.\s*V\.?/g, 'CV'],
  [/\bV\.\s*O\.\s*F\.?/g, 'VOF'],
  [/\bS\.\s*à\s*r\.?\s*l\.?/gi, 'Sàrl'],
  [/\bS\.\s*A\.\s*R\.\s*L\.?/g, 'SARL'],
  [/\bL\.\s*L\.\s*C\.?/g, 'LLC'],
  [/\bL\.\s*P\.?/g, 'LP'],
  [/\bG\.\s*m\.\s*b\.\s*H\.?/g, 'GmbH'],
  [/\bL\.\s*t\.\s*d\.?/g, 'Ltd'],
  [/\bLtd\./g, 'Ltd'],
  [/\bInc\./g, 'Inc'],
  [/\bp\.\s*l\.\s*c\.?/gi, 'plc'],
  [/\bS\.\s*A\.(?!\s*R)/g, 'SA'],
  [/\bA\.\s*G\./g, 'AG'],
];

/** Normalise an entity name to the firm house form (dotless legal suffixes). */
export function normalizeEntityName(name: string | null | undefined): string {
  let s = String(name ?? '').trim();
  for (const [re, rep] of SUFFIX_REPLACEMENTS) s = s.replace(re, rep);
  return s.replace(/\s{2,}/g, ' ').trim();
}
