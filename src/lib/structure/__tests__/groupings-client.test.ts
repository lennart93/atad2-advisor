import { describe, it, expect, vi, beforeEach } from 'vitest';

const { supabaseMock, fromMock } = vi.hoisted(() => {
  const select = vi.fn();
  const insert = vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: { id: 'g1', chart_id: 'c1', kind: 'fiscal_unity', label: 'F.E.', member_ids: ['a', 'b'], created_at: '' }, error: null })) })) }));
  const update = vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: { id: 'g1', chart_id: 'c1', kind: 'fiscal_unity', label: 'New', member_ids: ['a', 'b'], created_at: '' }, error: null })) })) })) }));
  const del = vi.fn(() => ({ eq: vi.fn(() => Promise.resolve({ error: null })) }));
  const fromMock = vi.fn(() => ({ select, insert, update, delete: del }));
  return { supabaseMock: { from: fromMock }, fromMock };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: supabaseMock }));

import { createGrouping, updateGrouping, deleteGrouping } from '@/lib/structure/client';

describe('groupings CRUD', () => {
  beforeEach(() => { fromMock.mockClear(); });

  it('createGrouping insert in de juiste tabel met de juiste payload', async () => {
    const result = await createGrouping({
      chart_id: 'c1',
      kind: 'fiscal_unity',
      label: 'F.E.',
      member_ids: ['a', 'b'],
    });
    expect(fromMock).toHaveBeenCalledWith('atad2_structure_groupings');
    expect(result.id).toBe('g1');
    expect(result.label).toBe('F.E.');
  });

  it('updateGrouping patcht label zonder kind of member_ids', async () => {
    const result = await updateGrouping('g1', { label: 'New' });
    expect(fromMock).toHaveBeenCalledWith('atad2_structure_groupings');
    expect(result.label).toBe('New');
  });

  it('deleteGrouping wist op id', async () => {
    await deleteGrouping('g1');
    expect(fromMock).toHaveBeenCalledWith('atad2_structure_groupings');
  });
});
