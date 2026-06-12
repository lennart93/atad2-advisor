import { describe, it, expect, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

import { coerceFacts } from '@/lib/appendix/client';

describe('coerceFacts', () => {
  it('returns null for null and normalizes objects', () => {
    expect(coerceFacts(null)).toBeNull();
    const f = coerceFacts({ entities: [{ id: 'E1' }] });
    expect(f?.transactions).toEqual([]);
    expect(f?.entities.length).toBe(1);
  });
});
