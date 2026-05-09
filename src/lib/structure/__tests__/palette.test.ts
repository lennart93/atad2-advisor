import { describe, it, expect } from 'vitest';
import { fillFor, isForeign } from '@/lib/structure/palette';

describe('palette.fillFor', () => {
  it('returns NL teal for individual NL entity, not the individual grey', () => {
    expect(fillFor({ entity_type: 'corporation', jurisdiction_iso: 'NL' })).toBe('#5d8b87');
  });
  it('returns foreign salmon for any non-NL jurisdiction', () => {
    expect(fillFor({ entity_type: 'corporation', jurisdiction_iso: 'US' })).toBe('#b56a5e');
    expect(fillFor({ entity_type: 'corporation', jurisdiction_iso: 'DE' })).toBe('#b56a5e');
    expect(fillFor({ entity_type: 'corporation', jurisdiction_iso: 'KY' })).toBe('#b56a5e');
  });
  it('returns individual grey for any individual regardless of jurisdiction', () => {
    expect(fillFor({ entity_type: 'individual', jurisdiction_iso: 'NL' })).toBe('#595550');
    expect(fillFor({ entity_type: 'individual', jurisdiction_iso: 'US' })).toBe('#595550');
  });
  it('treats lower-case ISO codes the same', () => {
    expect(fillFor({ entity_type: 'corporation', jurisdiction_iso: 'nl' })).toBe('#5d8b87');
    expect(fillFor({ entity_type: 'corporation', jurisdiction_iso: 'us' })).toBe('#b56a5e');
  });
});

describe('palette.isForeign', () => {
  it('NL is not foreign', () => {
    expect(isForeign('NL')).toBe(false);
    expect(isForeign('nl')).toBe(false);
  });
  it('everything else is foreign', () => {
    expect(isForeign('US')).toBe(true);
    expect(isForeign('DE')).toBe(true);
    expect(isForeign('')).toBe(true); // unknown jurisdiction → treated as foreign
  });
});
