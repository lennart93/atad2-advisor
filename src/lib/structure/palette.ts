import type { EntityType } from './types';

export const PALETTE = {
  // Node fills are white for every entity type. Jurisdiction and entity type
  // are no longer encoded in the fill; the shape carries the type and the
  // secondary text line carries the jurisdiction.
  nl: '#ffffff',
  foreign: '#ffffff',
  individual: '#ffffff',
  // Edge label background: the warm-paper canvas colour, so the % chip masks
  // the line behind the number and the connector "shows through" cleanly.
  background: '#faf8f4',
  // Connectors are warm taupe hairlines (Svalner brand), not near-black.
  ownershipStroke: '#cdc7ba',
  ownershipSelectedStroke: 'var(--ds-ink)',
  // Reserved (currently unused) styling for a triggered mismatch finding, with
  // its own dash pattern so it reads differently from a (solid) selected edge.
  mismatchStroke: 'var(--ds-ink)',
  mismatchDasharray: '6 3',
  normalTransactionStroke: '#cdc7ba',
  transactionDasharray: '3 3',
  // Brand ink for the node name; warm grey for the jurisdiction line.
  text: '#16150f',
  textMuted: '#57534a',
  // Inner hybrid glyphs stay a readable warm grey; the outer shape outline is
  // the brand taupe hairline now that fills are white.
  innerStroke: '#57534a',
  outerStroke: '#cdc7ba',
  nodeStroke: '#cdc7ba',
  // The taxpayer node is the hero: soft terracotta fill + terracotta outline +
  // a 3px terracotta letterhead line and a TAXPAYER pill (see EntityNode). The
  // name itself stays ink so it reads as the subject, not a coloured label.
  taxpayerFill: '#f0ddd5',
  taxpayerStroke: '#c25c3c',
  taxpayerText: '#16150f',
  taxpayerAccent: '#c25c3c',
  taxpayerPillText: '#ffffff',
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
