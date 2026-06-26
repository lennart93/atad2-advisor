import type { EntityType } from './types';

export const PALETTE = {
  // Node fills are white for every entity type. Jurisdiction and entity type
  // are no longer encoded in the fill; the shape carries the type and the
  // secondary text line carries the jurisdiction.
  nl: '#ffffff',
  foreign: '#ffffff',
  individual: '#ffffff',
  // Edge label background: plain white text panel, no chip.
  background: '#ffffff',
  ownershipStroke: '#8a8980',
  ownershipSelectedStroke: 'var(--ds-ink)',
  // Reserved (currently unused) styling for a triggered mismatch finding, with
  // its own dash pattern so it reads differently from a (solid) selected edge.
  mismatchStroke: 'var(--ds-ink)',
  mismatchDasharray: '6 3',
  normalTransactionStroke: '#8a8980',
  transactionDasharray: '3 3',
  text: '#1a1a1a',
  textMuted: '#5f5e5a',
  // Inner hybrid glyphs and the outer shape outline are both hairline-dark
  // now that fills are white.
  innerStroke: '#1a1a1a',
  outerStroke: '#1a1a1a',
  nodeStroke: '#1a1a1a',
  // The taxpayer node renders on a white fill with an ink outline; the shape
  // and the secondary text line carry its meaning, not a colored wash.
  taxpayerFill: '#ffffff',
  taxpayerStroke: 'var(--ds-ink)',
  taxpayerText: 'var(--ds-ink)',
  // Interaction affordances (selection, focus, reconnect drop targets).
  selectedStroke: 'var(--ds-ink)',
  focusStroke: 'var(--ds-accent)',
  dropValidStroke: '#0f6e56',
  dropInvalidStroke: '#b42318',
} as const;

export function isForeign(jurisdictionIso: string | null | undefined): boolean {
  return (jurisdictionIso ?? '').toUpperCase() !== 'NL';
}

/** Strip all dots from a legal form for display ("B.V." → "BV", "S.à r.l." → "Sàrl"). */
export function formatLegalForm(legalForm: string | null | undefined): string {
  if (!legalForm) return '';
  return legalForm.replace(/\./g, '');
}

export function fillFor(input: {
  entity_type: EntityType;
  jurisdiction_iso: string | null | undefined;
}): string {
  // Every entity type renders on a white fill; type is shape-encoded and
  // jurisdiction lives in the secondary text line.
  if (input.entity_type === 'individual') return PALETTE.individual;
  return isForeign(input.jurisdiction_iso) ? PALETTE.foreign : PALETTE.nl;
}
