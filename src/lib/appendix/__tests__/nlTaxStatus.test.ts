import { describe, it, expect } from 'vitest';
import {
  nlQualification, nlTaxStatusLabel, nlQualificationLabel, isNlTaxStatusKey,
  NL_TAX_STATUSES, NL_CLASSIFICATION_OPTIONS,
} from '@/lib/appendix/facts/nlTaxStatus';

describe('nlQualification', () => {
  it('maps resident, non-resident PE and outside-CIT to non-transparent', () => {
    expect(nlQualification('resident')).toBe('non-transparent');
    expect(nlQualification('nonresident_pe')).toBe('non-transparent');
    expect(nlQualification('outside_cit')).toBe('non-transparent');
  });
  it('maps transparent to transparent', () => {
    expect(nlQualification('transparent')).toBe('transparent');
  });
  it('maps unknown, null and unrecognised values to undetermined', () => {
    expect(nlQualification('unknown')).toBe('undetermined');
    expect(nlQualification(null)).toBe('undetermined');
    expect(nlQualification(undefined)).toBe('undetermined');
    expect(nlQualification('opaque')).toBe('undetermined');
  });
  it('maps the generic advisor picks to their qualification', () => {
    expect(nlQualification('non_transparent')).toBe('non-transparent');
    expect(nlQualification('reverse_hybrid')).toBe('reverse-hybrid');
  });
});

describe('NL_CLASSIFICATION_OPTIONS', () => {
  it('round-trips: every option stores a status key that derives its own qualification', () => {
    for (const o of NL_CLASSIFICATION_OPTIONS) {
      expect(nlQualification(o.statusKey)).toBe(o.qual);
      expect(nlQualificationLabel(o.qual)).toBe(o.label);
    }
  });
});

describe('labels', () => {
  it('returns the friendly label for a known key', () => {
    expect(nlTaxStatusLabel('resident')).toBe('Resident taxpayer');
    expect(nlTaxStatusLabel('transparent')).toBe('Transparent for NL');
  });
  it('falls back to the raw value, then Unknown', () => {
    expect(nlTaxStatusLabel('legacy free text')).toBe('legacy free text');
    expect(nlTaxStatusLabel(null)).toBe('Unknown');
    expect(nlTaxStatusLabel('')).toBe('Unknown');
  });
  it('labels each qualification', () => {
    expect(nlQualificationLabel('transparent')).toBe('Transparent');
    expect(nlQualificationLabel('non-transparent')).toBe('Non-transparent');
    expect(nlQualificationLabel('undetermined')).toBe('To be determined');
  });
});

describe('isNlTaxStatusKey', () => {
  it('recognises every defined key and nothing else', () => {
    for (const s of NL_TAX_STATUSES) expect(isNlTaxStatusKey(s.key)).toBe(true);
    expect(isNlTaxStatusKey('opaque')).toBe(false);
    expect(isNlTaxStatusKey(null)).toBe(false);
  });
});
