// The legal basis (grondslag) for a manually-defined acting-together group. The
// advisor picks one; each category carries a pre-filled, editable suggestion text
// that feeds the memo. Placeholders in [square brackets] are filled from the
// selected members and target where the data allows; the rest is left as prose
// for the advisor to finish.

export type ActingBasis =
  | 'family'
  | 'shareholders_agreement'
  | 'fund_structure'
  | 'coordinated_management'
  | 'other';

export const ACTING_BASES: ReadonlyArray<{ key: ActingBasis; label: string }> = [
  { key: 'family', label: 'Family relationship' },
  { key: 'shareholders_agreement', label: "Shareholders'/voting agreement" },
  { key: 'fund_structure', label: 'Fund structure (GP/LP or investors in concert)' },
  { key: 'coordinated_management', label: 'Coordinated management/board' },
  { key: 'other', label: 'Other' },
];

const KNOWN = new Set<string>(ACTING_BASES.map((b) => b.key));

export function isActingBasis(v: string | null | undefined): v is ActingBasis {
  return v != null && KNOWN.has(v);
}

export function actingBasisLabel(v: string | null | undefined): string {
  return ACTING_BASES.find((b) => b.key === v)?.label ?? 'Other';
}

// The starter sentences per category. 'other' is deliberately empty: it is a free
// text basis, so nothing is pre-filled.
const ACTING_TEMPLATES: Record<ActingBasis, string> = {
  family:
    '[A] and [B] are held within the same family group. As these persons act together in respect ' +
    'of the voting rights and capital of [target], their interests are aggregated for the ' +
    'related-party test under the hybrid mismatch rules.',
  shareholders_agreement:
    "[parties] have entered into a shareholders'/voting arrangement in respect of [target]. As they " +
    'act together with regard to the exercise of voting rights, their holdings are combined when ' +
    'assessing the 25%/50% related-party thresholds.',
  fund_structure:
    '[fund/GP] and the participating [LPs/investors] act together in respect of [target] through the ' +
    'fund structure. Their interests are aggregated for the related-party test, notwithstanding that ' +
    'no single investor individually meets the threshold.',
  coordinated_management:
    '[entities] are managed on a coordinated basis (common/overlapping [board/management]) and ' +
    'therefore act together in respect of [target]. Their interests are aggregated for the ' +
    'related-party assessment.',
  other: '',
};

/** "A" / "A and B" / "A, B and C": a readable member list for the suggestion text. */
export function joinNames(names: string[]): string {
  const xs = names.filter((n) => n && n.trim());
  if (xs.length === 0) return '';
  if (xs.length === 1) return xs[0];
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
}

/** Literal (non-regex) replace of every occurrence, so bracketed tokens with slashes are safe. */
function replaceAllLiteral(text: string, find: string, replacement: string): string {
  return text.split(find).join(replacement);
}

export interface ActingTemplateContext {
  /** Member names in selection order. */
  members: string[];
  /** The entity whose voting rights/capital the group acts over. */
  target: string | null;
}

/**
 * The suggestion text for a category, with the placeholders filled from the
 * selected members and target where the data allows. A missing member/target
 * falls back to neutral wording so the sentence still reads. '[board/management]'
 * cannot be derived, so it is rendered as plain prose for the advisor to refine.
 */
export function fillActingTemplate(basis: ActingBasis, ctx: ActingTemplateContext): string {
  const tpl = ACTING_TEMPLATES[basis] ?? '';
  if (!tpl) return '';
  const members = ctx.members.filter((n) => n && n.trim());
  const all = joinNames(members) || 'the parties';
  const target = (ctx.target && ctx.target.trim()) || 'the taxpayer';
  const a = members[0] ?? 'The first person';
  const b = members[1] ?? 'the other person';
  const fund = members[0] ?? 'the fund/GP';
  const investors = members.length > 1 ? joinNames(members.slice(1)) : 'the investors';

  let out = tpl;
  out = replaceAllLiteral(out, '[A]', a);
  out = replaceAllLiteral(out, '[B]', b);
  out = replaceAllLiteral(out, '[parties]', all);
  out = replaceAllLiteral(out, '[entities]', all);
  out = replaceAllLiteral(out, '[fund/GP]', fund);
  out = replaceAllLiteral(out, '[LPs/investors]', investors);
  out = replaceAllLiteral(out, '[target]', target);
  out = replaceAllLiteral(out, '[board/management]', 'board/management');
  return out;
}
