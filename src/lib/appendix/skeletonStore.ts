import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { APPENDIX_SKELETON } from './skeleton';
import type { SkeletonRow, Status } from './types';

interface DbSkeletonRow {
  row_id: string;
  section_id: string;
  section_title: string;
  legal_basis: string;
  condition_tested: string;
  effect: string | null;
  allowed_states: unknown;
  driven_by_question_ids: unknown;
  render_if: unknown;
  sort_order: number;
}

function mapDbRow(r: DbSkeletonRow): SkeletonRow {
  return {
    rowId: r.row_id,
    sectionId: r.section_id,
    sectionTitle: r.section_title,
    legalBasis: r.legal_basis,
    conditionTested: r.condition_tested,
    effect: (r.effect as SkeletonRow['effect']) ?? null,
    allowedStates: (Array.isArray(r.allowed_states) ? r.allowed_states : []) as Status[],
    drivenByQuestionIds: (Array.isArray(r.driven_by_question_ids) ? r.driven_by_question_ids : []) as string[],
    renderIfQuestionEquals: (r.render_if as SkeletonRow['renderIfQuestionEquals']) ?? undefined,
  };
}

/**
 * The DB-backed legal-framework rows, falling back to the hard-coded seed when
 * the table is empty or unreachable. Loading it warms a module cache so sync
 * consumers (memo block, DOCX, print) can pass it explicitly.
 */
export async function loadAppendixSkeleton(): Promise<SkeletonRow[]> {
  const { data, error } = await supabase
    .from('atad2_appendix_skeleton')
    .select('row_id, section_id, section_title, legal_basis, condition_tested, effect, allowed_states, driven_by_question_ids, render_if, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true });
  if (error || !data || data.length === 0) return APPENDIX_SKELETON;
  return (data as DbSkeletonRow[]).map(mapDbRow);
}

/** React-query hook; serves the static seed immediately, then the DB rows. */
export function useAppendixSkeleton() {
  return useQuery({
    queryKey: ['appendix-skeleton'],
    queryFn: loadAppendixSkeleton,
    staleTime: 5 * 60_000,
    initialData: APPENDIX_SKELETON,
  });
}
