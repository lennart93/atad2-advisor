import type { EntityType } from './types';

export const PALETTE = {
  nl: '#5d8b87',
  foreign: '#b56a5e',
  individual: '#595550',
  background: '#ebe5dc',
  ownershipStroke: '#5a5550',
  mismatchStroke: '#a04338',
  normalTransactionStroke: '#1f5489',
  text: '#ffffff',
  textMuted: 'rgba(255,255,255,0.78)',
  innerStroke: '#ffffff',
  outerStroke: 'rgba(0,0,0,0.22)',
} as const;

export function isForeign(jurisdictionIso: string | null | undefined): boolean {
  return (jurisdictionIso ?? '').toUpperCase() !== 'NL';
}

export function fillFor(input: {
  entity_type: EntityType;
  jurisdiction_iso: string | null | undefined;
}): string {
  if (input.entity_type === 'individual') return PALETTE.individual;
  return isForeign(input.jurisdiction_iso) ? PALETTE.foreign : PALETTE.nl;
}
