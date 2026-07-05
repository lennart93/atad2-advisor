import type { FactEntity } from '@/lib/appendix/types';

/**
 * The parents and direct shareholders of the taxpayer that an acting-together
 * (samenwerkende groep) assessment weighs: every external Parent, plus any group
 * entity the facts pass flagged as holding shares directly in the taxpayer even
 * without an ownership edge (share counts / shareholder registers). This mirrors
 * the facts prompt's own rule that a grouping needs "two or more parents or direct
 * shareholders" to assess, so when two or more exist the section should never be
 * empty. Advisor-hidden entities (marked irrelevant) do not count.
 *
 * Kept in sync with countActingTogetherCandidates in
 * supabase/functions/generate-appendix/factsBuild.ts (Deno cannot import from src/).
 */
export function actingTogetherCandidateEntities(entities: FactEntity[]): FactEntity[] {
  return entities.filter(
    (e) => !e.hidden && (e.role === 'Parent' || e.shareholderOfTaxpayer === true),
  );
}

export function actingTogetherCandidateCount(entities: FactEntity[]): number {
  return actingTogetherCandidateEntities(entities).length;
}
