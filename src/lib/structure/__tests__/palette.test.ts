import { describe, it, expect } from 'vitest';
import { fillFor, isForeign } from '@/lib/structure/palette';

describe('palette.fillFor', () => {
  // Fills no longer encode jurisdiction or entity type: every shape renders
  // on white. Type is shape-encoded; jurisdiction lives in the text line.
  it('returns white for NL entities', () => {
    expect(fillFor({ entity_type: 'corporation', jurisdiction_iso: 'NL' })).toBe('#ffffff');
  });
  it('returns white for any non-NL jurisdiction', () => {
    expect(fillFor({ entity_type: 'corporation', jurisdiction_iso: 'US' })).toBe('#ffffff');
    expect(fillFor({ entity_type: 'corporation', jurisdiction_iso: 'DE' })).toBe('#ffffff');
    expect(fillFor({ entity_type: 'corporation', jurisdiction_iso: 'KY' })).toBe('#ffffff');
  });
  it('returns white for individuals regardless of jurisdiction', () => {
    expect(fillFor({ entity_type: 'individual', jurisdiction_iso: 'NL' })).toBe('#ffffff');
    expect(fillFor({ entity_type: 'individual', jurisdiction_iso: 'US' })).toBe('#ffffff');
  });
  it('treats lower-case ISO codes the same', () => {
    expect(fillFor({ entity_type: 'corporation', jurisdiction_iso: 'nl' })).toBe('#ffffff');
    expect(fillFor({ entity_type: 'corporation', jurisdiction_iso: 'us' })).toBe('#ffffff');
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
