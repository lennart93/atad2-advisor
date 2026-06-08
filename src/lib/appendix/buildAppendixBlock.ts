import { APPENDIX_SKELETON } from './skeleton';
import type { AppendixFacts, AppendixRow, SkeletonRow } from './types';
import { factsForClient } from './factsExport';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildFactsSummary(facts: AppendixFacts): string {
  const f = factsForClient(facts);
  const nameOf = (id: string) => f.entities.find((e) => e.id === id)?.name ?? id;
  const ents = f.entities
    .map((e) => `- ${esc(e.name)} (${e.jurisdiction ?? '?'}, ${e.role}${e.ownershipPct != null ? `, ${e.ownershipPct}%` : ''}${e.related ? ', related' : ''}${e.nlTaxStatus ? `, ${esc(e.nlTaxStatus)}` : ''})`)
    .join('\n');
  const cls = [...f.classifications]
    .sort((a, b) => Number(b.hybrid) - Number(a.hybrid)) // hybrids first
    .map((c) => `- ${esc(nameOf(c.entityId))}: home ${esc(c.homeState)} ${esc(c.homeClass)} vs source ${esc(c.sourceState ?? '?')} ${esc(c.sourceClass ?? '?')}${c.hybrid ? ' (hybrid mismatch)' : ''}`)
    .join('\n');
  const tx = f.transactions
    .map((t) => `- ${esc(nameOf(t.fromEntityId))} -> ${esc(nameOf(t.toEntityId))}: ${esc(t.kind)}${t.instrument ? ` (${esc(t.instrument)})` : ''}${t.articlesTested.length ? ` [${t.articlesTested.map(esc).join(', ')}]` : ''}`)
    .join('\n');
  const at = f.actingTogether
    .map((a) => `- ${a.memberEntityIds.map((id) => esc(nameOf(id))).join(' + ')} ~ ${a.combinedPct ?? '?'}%: ${esc(a.rationale)}`)
    .join('\n');
  const parts = [
    ents ? `Entities:\n${ents}` : '',
    cls ? `Classification (home vs source):\n${cls}` : '',
    tx ? `Intra-group transactions:\n${tx}` : '',
    at ? `Acting-together groups:\n${at}` : '',
  ].filter(Boolean).join('\n');
  return `<facts>\n${parts}\n</facts>`;
}

/**
 * Confirmed rows as a grounded block for the memo prompt. Internal provenance is
 * intentionally omitted; only the legal basis, condition, status and the clean
 * reasoning are fed in.
 *
 * When `facts` is supplied and has at least one entity, a compact `<facts>` block
 * (confirmed, non-excluded items only) is prepended so the memo can reference
 * entities, hybrid classifications, and intra-group transactions.
 */
export function buildAppendixBlock(rows: AppendixRow[], skeleton: SkeletonRow[] = APPENDIX_SKELETON, facts: AppendixFacts | null = null): string {
  const byId = new Map(skeleton.map((r) => [r.rowId, r]));
  const lines = rows
    .filter((r) => !r.excludedFromClient)
    .map((r) => {
      const sk = byId.get(r.rowId);
      const basis = sk ? `${sk.legalBasis} - ${sk.conditionTested}` : r.rowId;
      return `- [${r.rowId}] ${esc(basis)} :: ${esc(r.status ?? '')} :: ${esc(r.reasoning ?? '')}`;
    });
  const factsBlock = facts && facts.entities.length ? `${buildFactsSummary(facts)}\n` : '';
  return `${factsBlock}<confirmed_appendix>\n${lines.join('\n')}\n</confirmed_appendix>`;
}
