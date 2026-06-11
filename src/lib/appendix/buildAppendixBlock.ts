import { APPENDIX_SKELETON } from './skeleton';
import type { AppendixFacts, AppendixRow, SkeletonRow, StoredAppendix } from './types';
import { factsForClient } from './factsExport';
import { isSectionExcluded } from './facts/sections';
import { effJurisdiction, effNlTaxStatus } from './facts/entityFields';
import { nlQualification, nlQualificationLabel } from './facts/nlTaxStatus';
import { actingLikelihoodLabel } from './facts/actingLikelihood';
import { deriveConclusions } from './facts/conclusions';
import { relevantTransactions, accountedTransactionGroups } from './facts/relevance';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function buildFactsSummary(facts: AppendixFacts): string {
  const f = factsForClient(facts);
  // Sections the advisor excluded from the client export are also dropped from the
  // memo grounding (it feeds the client-facing memo). Read from `f` (which preserves
  // excludedSections) so this stays in lockstep with the dossier.
  const ex = (key: Parameters<typeof isSectionExcluded>[1]) => isSectionExcluded(f, key);
  const nameOf = (id: string) => f.entities.find((e) => e.id === id)?.name ?? id;
  const showRelated = !ex('relatedness');
  const ents = ex('entityRegister') ? '' : f.entities
    .map((e) => {
      const jur = effJurisdiction(e);
      const status = effNlTaxStatus(e);
      const nlQual = nlQualificationLabel(nlQualification(status));
      return `- ${esc(nameOf(e.id))} (${jur ?? '?'}, ${e.role}${e.ownershipPct != null ? `, ${e.ownershipPct}%` : ''}${showRelated && e.related ? ', related' : ''}, NL: ${esc(nlQual)})`;
    })
    .join('\n');
  const cls = ex('classification') ? '' : [...f.classifications]
    .sort((a, b) => Number(b.hybrid) - Number(a.hybrid)) // hybrids first
    .map((c) => `- ${esc(nameOf(c.entityId))}: home ${esc(c.homeState)} ${esc(c.homeClass)} vs source ${esc(c.sourceState ?? '?')} ${esc(c.sourceClass ?? '?')}${c.hybrid ? ' (hybrid mismatch)' : ''}`)
    .join('\n');
  const relTx = ex('transactions') ? [] : relevantTransactions(f);
  const tx = relTx
    .map((t) => `- ${esc(nameOf(t.fromEntityId))} -> ${esc(nameOf(t.toEntityId))}: ${esc(t.kind)}${t.instrument ? ` (${esc(t.instrument)})` : ''}${t.relevanceReason ? ` [why: ${esc(t.relevanceReason)}]` : ''}${t.articlesTested.length ? ` [${t.articlesTested.map(esc).join(', ')}]` : ''}`)
    .join('\n');
  const txAccounted = ex('transactions') ? '' : accountedTransactionGroups(f)
    .map((g) => `- ${g.transactions.length} ${g.transactions.length === 1 ? 'transaction' : 'transactions'} assessed as not relevant (${esc(g.reason)})`)
    .join('\n');
  const at = ex('actingTogether') ? '' : f.actingTogether
    .map((a) => `- ${a.memberEntityIds.map((id) => esc(nameOf(id))).join(' + ')} ~ ${a.combinedPct ?? '?'}%: ${esc(actingLikelihoodLabel(a.likelihood))} - ${esc(a.reasoning)}`)
    .join('\n');
  // Conclusions are derived from the same client-filtered base the block renders
  // from, so the memo can never claim more than its own grounding shows.
  const flags = deriveConclusions(f);
  const conclusions = [
    `- Cross-border transactions with related parties: ${flags.crossBorderRelatedFlows}`,
    `- Hybrid qualification differences (NL vs local): ${flags.hybridDifferences}`,
    `- Acting-together clusters considered likely: ${flags.likelyActingTogether}`,
  ].join('\n');
  const parts = [
    `Conclusion flags (computed):\n${conclusions}`,
    ents ? `Entities (with NL classification):\n${ents}` : '',
    cls ? `Cross-border classification (home vs source):\n${cls}` : '',
    tx ? `Relevant intra-group transactions:\n${tx}` : '',
    txAccounted ? `Transactions accounted for and set aside:\n${txAccounted}` : '',
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
 * the computed conclusion flags, entities, hybrid classifications, and the
 * relevant intra-group transactions (with set-aside flows summarized as counts).
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
  const rowsBlock = lines.length ? `<confirmed_appendix>\n${lines.join('\n')}\n</confirmed_appendix>` : '';
  return `${factsBlock}${rowsBlock}`;
}

/**
 * The memo appendix block with the advisor's per-page skip applied: a skipped
 * Facts page drops the <facts> block, a skipped Checklist page drops the rows.
 * Returns null when both are skipped (no appendix block is sent).
 */
export function appendixMemoBlock(
  appendix: Pick<StoredAppendix, 'rows' | 'facts' | 'facts_skipped' | 'checklist_skipped'>,
  skeleton: SkeletonRow[] = APPENDIX_SKELETON,
): string | null {
  const facts = appendix.facts_skipped ? null : appendix.facts;
  const rows = appendix.checklist_skipped ? [] : appendix.rows;
  const hasFacts = !!facts && facts.entities.length > 0;
  if (!hasFacts && rows.length === 0) return null;
  return buildAppendixBlock(rows, skeleton, facts);
}
