import { describe, it, expect } from 'vitest';
import { withLocalQualification } from '@/lib/appendix/facts/classificationEdit';
import type { AppendixFacts } from '@/lib/appendix/types';

const facts = (classifications: AppendixFacts['classifications'] = []): AppendixFacts => ({
  entities: [], actingTogether: [], transactions: [], classifications,
});

describe('withLocalQualification', () => {
  it('inserts an edited row when none exists', () => {
    const next = withLocalQualification(facts(), 'E2', 'transparent', 'US');
    expect(next.classifications[0]).toMatchObject({ entityId: 'E2', homeClass: 'transparent', homeState: 'US', source: 'edited' });
  });

  it('updates an existing row in place', () => {
    const base = facts([{ entityId: 'E2', homeState: 'US', homeClass: 'opaque', sourceState: null, sourceClass: null, hybrid: true, status: 'proposed', excludedFromClient: false, source: 'ai' }]);
    const next = withLocalQualification(base, 'E2', 'transparent', 'US');
    expect(next.classifications).toHaveLength(1);
    expect(next.classifications[0]).toMatchObject({ homeClass: 'transparent', source: 'edited' });
  });

  it("clears back to undetermined with 'unknown' and keeps it cleared (edited)", () => {
    const base = withLocalQualification(facts(), 'E2', 'opaque', 'US');
    const next = withLocalQualification(base, 'E2', 'unknown', 'US');
    expect(next.classifications[0]).toMatchObject({ homeClass: '', source: 'edited' });
  });
});
