import { describe, it, expect, beforeEach, vi } from 'vitest';

// The test env is `node` (see vitest.config.ts) which does not provide
// localStorage. Install a minimal in-memory shim before importing the SUT.
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).localStorage = {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, String(v)),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  };
}

// Mock the supabase client and the startExtraction module BEFORE importing the
// SUT, so the helper picks up the mocks on first import. We use `vi.hoisted`
// so the shared state survives vi.mock's hoisting.
const { docRows, supabaseMock, startExtraction } = vi.hoisted(() => {
  const docRows: { id: string }[] = [];
  const supabaseMock = {
    from: () => ({
      select: () => ({
        eq: () => Promise.resolve({ data: docRows, error: null }),
      }),
    }),
  };
  const startExtraction = vi.fn(() => Promise.resolve({ chart_id: 'chart-1' }));
  return { docRows, supabaseMock, startExtraction };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: supabaseMock }));
vi.mock('@/lib/structure/extraction', () => ({ startExtraction }));

import { maybePrewarmPhaseA } from '../phaseAPrewarm';

describe('maybePrewarmPhaseA', () => {
  beforeEach(() => {
    localStorage.clear();
    docRows.length = 0;
    startExtraction.mockClear();
    startExtraction.mockResolvedValue({ chart_id: 'chart-1' });
  });

  it('fires extraction when docs exist and no fingerprint stored', async () => {
    docRows.push({ id: 'a' }, { id: 'b' });
    await maybePrewarmPhaseA('session-1');
    expect(startExtraction).toHaveBeenCalledWith('session-1', 'docs_only');
    expect(localStorage.getItem('phaseA:session-1')).toBe('a|b');
  });

  it('skips when fingerprint matches stored value', async () => {
    docRows.push({ id: 'a' }, { id: 'b' });
    localStorage.setItem('phaseA:session-1', 'a|b');
    await maybePrewarmPhaseA('session-1');
    expect(startExtraction).not.toHaveBeenCalled();
  });

  it('fires extraction when fingerprint differs (new doc uploaded)', async () => {
    docRows.push({ id: 'a' }, { id: 'b' }, { id: 'c' });
    localStorage.setItem('phaseA:session-1', 'a|b');
    await maybePrewarmPhaseA('session-1');
    expect(startExtraction).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('phaseA:session-1')).toBe('a|b|c');
  });

  it('skips when no documents exist', async () => {
    await maybePrewarmPhaseA('session-1');
    expect(startExtraction).not.toHaveBeenCalled();
    expect(localStorage.getItem('phaseA:session-1')).toBeNull();
  });

  it('sorts ids so insertion order does not change the fingerprint', async () => {
    docRows.push({ id: 'b' }, { id: 'a' });
    await maybePrewarmPhaseA('session-1');
    expect(localStorage.getItem('phaseA:session-1')).toBe('a|b');
  });

  it('clears the stored fingerprint on extraction error so next call retries', async () => {
    docRows.push({ id: 'a' });
    const err = new Error('boom') as Error & { status: number };
    err.status = 500;
    startExtraction.mockRejectedValueOnce(err);
    await maybePrewarmPhaseA('session-1');
    expect(localStorage.getItem('phaseA:session-1')).toBeNull();
  });

  it('clears the stored fingerprint on 409 too (next navigation re-evaluates)', async () => {
    docRows.push({ id: 'a' });
    const err = new Error('busy') as Error & { status: number };
    err.status = 409;
    startExtraction.mockRejectedValueOnce(err);
    await maybePrewarmPhaseA('session-1');
    expect(localStorage.getItem('phaseA:session-1')).toBeNull();
  });
});
