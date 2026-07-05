import { describe, it, expect } from 'vitest';
import { actingInClientAnnex, actingInClientReport, actingLikelyByDefault } from '@/lib/appendix/facts/actingAnnex';
import { withClusterAnnex } from '@/lib/appendix/facts/actingCluster';
import { emptyFacts } from '@/lib/appendix/facts/emptyFacts';
import type { ActingTogetherCluster, AppendixFacts } from '@/lib/appendix/types';

const cluster = (patch: Partial<ActingTogetherCluster>): ActingTogetherCluster => ({
  id: 'A1', memberEntityIds: ['E2', 'E3'], combinedPct: 25,
  likelihood: 'unlikely', reasoning: '', excludedFromClient: false, source: 'ai', ...patch,
});
const facts = (c: ActingTogetherCluster): AppendixFacts => ({ ...emptyFacts(), actingTogether: [c] });

describe('acting-together annex inclusion', () => {
  it('likely and higher are in the annex by default', () => {
    expect(actingLikelyByDefault('likely')).toBe(true);
    expect(actingLikelyByDefault('highly_likely')).toBe(true);
    expect(actingLikelyByDefault('unclear')).toBe(false);
    expect(actingInClientAnnex(cluster({ likelihood: 'likely' }))).toBe(true);
    expect(actingInClientAnnex(cluster({ likelihood: 'unlikely' }))).toBe(false);
  });

  it('a legacy excludedFromClient flag still removes a likely grouping', () => {
    expect(actingInClientAnnex(cluster({ likelihood: 'likely', excludedFromClient: true }))).toBe(false);
  });

  it('the explicit include override wins over the likelihood default', () => {
    // Include an unlikely grouping anyway.
    expect(actingInClientAnnex(cluster({ likelihood: 'unlikely', includeInClient: true }))).toBe(true);
    // Leave a likely grouping out.
    expect(actingInClientAnnex(cluster({ likelihood: 'likely', includeInClient: false }))).toBe(false);
  });

  it('actingInClientReport surfaces manual groups only, honouring the hidden flag', () => {
    // AI hints never reach the client, whatever their likelihood.
    expect(actingInClientReport(cluster({ likelihood: 'highly_likely' }))).toBe(false);
    expect(actingInClientReport(cluster({ origin: 'ai', likelihood: 'highly_likely' }))).toBe(false);
    // A manual group is client-facing by default, unless the advisor hid it.
    expect(actingInClientReport(cluster({ origin: 'manual', likelihood: 'unlikely' }))).toBe(true);
    expect(actingInClientReport(cluster({ origin: 'manual', excludedFromClient: true }))).toBe(false);
  });

  it('withClusterAnnex records the decision and keeps excludedFromClient in sync', () => {
    const inOut = withClusterAnnex(facts(cluster({ likelihood: 'unlikely' })), 'A1', true).actingTogether[0];
    expect(inOut.includeInClient).toBe(true);
    expect(inOut.excludedFromClient).toBe(false);
    expect(actingInClientAnnex(inOut)).toBe(true);

    const leftOut = withClusterAnnex(facts(cluster({ likelihood: 'likely' })), 'A1', false).actingTogether[0];
    expect(leftOut.includeInClient).toBe(false);
    expect(leftOut.excludedFromClient).toBe(true);
    expect(actingInClientAnnex(leftOut)).toBe(false);
  });
});
