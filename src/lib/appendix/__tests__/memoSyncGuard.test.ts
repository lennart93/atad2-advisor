import { describe, it, expect } from 'vitest';

import { checkAppendixSync } from '@/lib/appendix/memoSyncGuard';
import type { AppendixRow, StoredAppendix } from '@/lib/appendix/types';

const baseRow = (overrides: Partial<AppendixRow> = {}): AppendixRow => ({
  rowId: '1.1',
  aiStatus: 'Not triggered', aiReasoning: 'x', aiProvenance: 'x',
  status: 'Not triggered', reasoning: 'x', provenance: 'x',
  excludedFromClient: false, source: 'ai', stale: false, staleReason: null, editedBy: null, editedAt: null,
  ...overrides,
});

const appendix = (overrides: Partial<StoredAppendix> = {}): StoredAppendix => ({
  id: 'a1', session_id: 's1',
  review_status: 'confirmed', generation_status: 'ready',
  rows: [baseRow()], facts: null,
  facts_skipped: false, checklist_skipped: false,
  model: null, prompt_version: null, error_message: null,
  generated_at: null, confirmed_at: null, confirmed_by: null, updated_at: null,
  ...overrides,
});

describe('checkAppendixSync', () => {
  it('blocks when no appendix exists', () => {
    expect(checkAppendixSync(null).ok).toBe(false);
  });

  it('blocks while an unconfirmed appendix is still generating', () => {
    const r = checkAppendixSync(appendix({ generation_status: 'generating', review_status: 'draft' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/still being generated/i);
  });

  it('does NOT block a confirmed appendix that is mid background-regeneration', () => {
    // A confirmed appendix already has valid content; a transient regen must not block.
    const r = checkAppendixSync(appendix({ generation_status: 'generating', review_status: 'confirmed' }));
    expect(r.ok).toBe(true);
  });

  it('blocks when the appendix is not confirmed', () => {
    const r = checkAppendixSync(appendix({ review_status: 'draft' }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/not confirmed/i);
  });

  it('blocks when a condition is stale against the answers', () => {
    const r = checkAppendixSync(appendix({ rows: [baseRow({ stale: true, staleReason: 'Q1 changed' })] }));
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/out of date with the answers/i);
  });

  it('ignores stale rows that the advisor excluded from the client', () => {
    const r = checkAppendixSync(appendix({ rows: [baseRow({ stale: true, excludedFromClient: true })] }));
    expect(r.ok).toBe(true);
  });

  it('passes a ready, confirmed appendix', () => {
    const r = checkAppendixSync(appendix());
    expect(r.ok).toBe(true);
  });
});
