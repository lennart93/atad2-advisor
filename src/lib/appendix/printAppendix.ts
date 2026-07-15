import { APPENDIX_SKELETON } from './skeleton';
import { buildClientSections } from './clientExport';
import { tonePrintColor, statusDisplayLabel } from './status';
import { rowTone } from './conditionPolarity';
import type { AppendixFacts, AppendixRow, AppendixSectionKey, FactEntity, NarrativeKey, RowKind, SkeletonRow, Status } from './types';
import { factsForClient } from './factsExport';
import { visibleFacts } from './facts/visibleFacts';
import { isSectionExcluded } from './facts/sections';
import { effJurisdiction, effNlQualification, effRelationType, effRelatedPct } from './facts/entityFields';
import { nlQualificationLabel } from './facts/nlTaxStatus';
import { actingBasisLabel } from './facts/actingBasis';
import { displayReasoning } from './rowReasoning';
import { appendixMootRowIds, GATE_ROWS } from './controlType';
import { deriveConclusions, inScopeEntityIds, effLocalQualification, entityHasQualificationDifference, dutchForeignClassification } from './facts/conclusions';
import { relevantTransactions, accountedTransactionGroups } from './facts/relevance';
import { txMemoReason } from './facts/transactionAssessment';
import { countryName } from '@/lib/structure/countries';

const jurLabel = (iso: string | null) => (iso ? `${countryName(iso)} (${iso})` : '');

const esc = (s: string | null) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Which artifact to render. */
export type PrintMode = 'internal' | 'dossier';

interface PrintRow { code: string; polarityId: string; legalBasis: string; conditionTested: string; status: Status | null; kind: RowKind; reasoning: string | null; provenance: string | null; stale: boolean; excluded: boolean; }
interface PrintSection { heading: string; rows: PrintRow[] }

/**
 * Full, print-friendly HTML for the whole appendix.
 *
 * 'internal' is the working copy: every row in its original numbering, with the
 * provenance column, and excluded rows marked. 'dossier' is the clean client/file
 * version: excluded rows are dropped and the rest renumbered contiguously, no
 * provenance, no internal ids.
 */
export function buildAppendixPrintHtml(
  rows: AppendixRow[],
  mode: PrintMode,
  skeleton: SkeletonRow[] = APPENDIX_SKELETON,
  facts: AppendixFacts | null = null,
): string {
  const internal = mode === 'internal';
  const sections: PrintSection[] = [];
  // A moot N/A row shows its short "not reached" line, not the model's paragraph
  // (displayReasoning), so the print export agrees with the screen and the memo.
  const mootSet = appendixMootRowIds(rows);

  if (internal) {
    const byId = new Map(rows.map((r) => [r.rowId, r]));
    for (const sk of skeleton) {
      const row = byId.get(sk.rowId);
      if (!row) continue;
      let s = sections.find((x) => x.heading === `Section ${sk.sectionId}. ${sk.sectionTitle}`);
      if (!s) { s = { heading: `Section ${sk.sectionId}. ${sk.sectionTitle}`, rows: [] }; sections.push(s); }
      s.rows.push({
        code: sk.rowId, polarityId: sk.rowId, legalBasis: sk.legalBasis, conditionTested: sk.conditionTested,
        status: row.status, kind: sk.kind, reasoning: displayReasoning(row, mootSet), provenance: row.provenance,
        stale: row.stale, excluded: row.excludedFromClient,
      });
    }
  } else {
    for (const cs of buildClientSections(rows, skeleton)) {
      sections.push({
        heading: `Section ${cs.displayNum}. ${cs.sectionTitle}`,
        rows: cs.rows.map((cr) => ({
          code: cr.displayCode, polarityId: cr.sk.rowId, legalBasis: cr.sk.legalBasis, conditionTested: cr.sk.conditionTested,
          status: cr.row.status, kind: cr.sk.kind, reasoning: displayReasoning(cr.row, mootSet), provenance: cr.row.provenance,
          stale: cr.row.stale, excluded: false,
        })),
      });
    }
  }

  const statusCell = (status: Status | null, polarityId: string, flag: string) => {
    const { bg, fg } = tonePrintColor(rowTone(status, polarityId));
    const label = statusDisplayLabel(status);
    // A gateway row (1.1 / 1.2 / 2.1 / 6.1) carries a plain black note after the
    // label; the label itself keeps the status colour and weight.
    const gateNote = label && GATE_ROWS.has(polarityId)
      ? `<span class="gate-note"> (gateway question)</span>`
      : '';
    return `<td class="c-status" style="background:${bg};color:${fg};">${esc(label)}${gateNote}${flag}</td>`;
  };

  const header =
    `<tr><th class="c-num">#</th><th class="c-basis">Legal basis</th><th>Condition tested</th>` +
    `<th class="c-status">Status</th><th class="c-reason">Reasoning</th>` +
    (internal ? `<th class="c-prov">Source (internal)</th>` : '') +
    `</tr>`;

  const body = sections
    .map((s) => {
      const rowsHtml = s.rows
        .map((r) => {
          const flags = (r.stale ? ` <span class="flag">review again</span>` : '')
            + (r.excluded ? ` <span class="flag">excluded</span>` : '');
          const prov = internal ? `<td class="c-prov">${esc(r.provenance)}</td>` : '';
          return (
            `<tr class="${r.excluded ? 'excluded' : ''}"><td class="c-num">${esc(r.code)}</td>` +
            `<td class="c-basis">${esc(r.legalBasis)}</td>` +
            `<td>${esc(r.conditionTested)}</td>` +
            statusCell(r.status, r.polarityId, flags) +
            `<td class="c-reason">${esc(r.reasoning)}</td>${prov}</tr>`
          );
        })
        .join('');
      return `<h2>${esc(s.heading)}</h2><table>${header}${rowsHtml}</table>`;
    })
    .join('\n');

  const banner = internal
    ? `<div class="banner"><strong>Draft, pending tax review.</strong> Internal working copy, includes internal references and excluded rows. Do not share this version externally.</div>`
    : '';

  // ---- Part A: Facts & relationships (funnel order, mirrors FactsPanel) ------
  const partA = (() => {
    if (!facts || facts.entities.length === 0) return '';
    // Internal working copy: everything the advisor still has visible (hidden
    // entities are out, like in the app). Dossier: the client-filtered facts, so
    // the strip and scope can never claim more than the tables show.
    const f = internal ? visibleFacts(facts) : factsForClient(facts);
    // In the client dossier, whole sections the advisor marked "exclude from client"
    // are dropped. The internal working copy always shows every section.
    const drop = (key: AppendixSectionKey) => !internal && isSectionExcluded(f, key);

    const entityById = new Map(f.entities.map((e) => [e.id, e]));
    const entityName = (id: string) => entityById.get(id)?.name ?? id;

    // One connective AI sentence under each section title. Narratives live on the
    // full facts (factsForClient does not carry them) and are advisor-reviewed text.
    const narrative = (key: NarrativeKey) => {
      const n = facts.narratives?.[key];
      return n?.text ? `<p class="narrative">${esc(n.text)}</p>` : '';
    };

    // Summary strip: deterministic funnel flags, computed from the same base
    // as the tables below (advisor edits included), never written by the model.
    const flags = deriveConclusions(f);
    const at = flags.actingTogetherGroups;
    const strip =
      `<table>` +
      `<tr><td>Cross-border transactions with related parties</td><td>${flags.crossBorderRelatedFlows > 0 ? `${flags.crossBorderRelatedFlows} identified` : 'None identified'}</td></tr>` +
      `<tr><td>Hybrid qualification differences (NL vs local)</td><td>${flags.hybridDifferences > 0 ? `${flags.hybridDifferences} identified` : 'None identified'}</td></tr>` +
      `<tr><td>Acting-together groups</td><td>${at > 0 ? `${at} ${at === 1 ? 'group' : 'groups'}` : 'None'}</td></tr>` +
      `</table>`;

    // A.1 - The taxpayer and the group: taxpayer side (incl. fiscal-unity members) first.
    const isTaxpayerSide = (e: FactEntity) =>
      e.role === 'Taxpayer' || !!e.memberOfUnityId || !!e.inTaxpayerFiscalUnity;
    const roleText = (e: FactEntity): string => {
      const edited = effRelationType(e);
      if (edited) return edited + (e.inTaxpayerFiscalUnity ? ' (fiscal unity)' : '');
      if (e.role === 'Subsidiary' && e.directLink != null) {
        return e.directLink ? 'Subsidiary (direct)' : 'Subsidiary (indirect)';
      }
      const label = e.role === 'Group entity' ? (e.shareholderOfTaxpayer ? 'Shareholder' : 'Other') : e.role;
      return label + (e.inTaxpayerFiscalUnity ? ' (fiscal unity)' : '');
    };
    const positionNote = (e: FactEntity): string => {
      if (e.role === 'Taxpayer' || e.memberOfUnityId) return '';
      // The advisor's edited relation reasoning wins over any derived note.
      const edited = e.edits?.relationReason?.trim();
      if (edited) return `; ${edited}`;
      if (e.role !== 'Group entity') return '';
      if (e.relatedVia) {
        const viaName = entityName(e.relatedVia);
        return e.relatedViaPct != null
          ? `; sister entity: ${viaName} holds ${e.relatedViaPct}% here and more than 25% in the taxpayer`
          : `; sister entity via ${viaName}`;
      }
      const position = e.position?.trim();
      return position ? `; ${position}` : '';
    };
    const registerRow = (e: FactEntity, taxpayerSide: boolean) => {
      const refCol = internal ? `<td class="c-num">${esc(e.id)}</td>` : '';
      return (
        `<tr${taxpayerSide ? ' class="taxpayer"' : ''}>` +
        refCol +
        `<td>${esc(e.name)}</td>` +
        `<td>${esc(jurLabel(effJurisdiction(e)))}</td>` +
        `<td>${esc(nlQualificationLabel(effNlQualification(e)))}</td>` +
        `<td>${esc(roleText(e))}${esc(positionNote(e))}</td></tr>`
      );
    };
    const registerRows =
      f.entities.filter(isTaxpayerSide).map((e) => registerRow(e, true)).join('') +
      f.entities.filter((e) => !isTaxpayerSide(e)).map((e) => registerRow(e, false)).join('');
    const refHeader = internal ? `<th class="c-num">Ref</th>` : '';
    const registerBlock = (!drop('entityRegister') && registerRows)
      ? `<h2>A.1 · The taxpayer and the group</h2>` + narrative('register') +
        `<table><tr>${refHeader}<th>Entity</th><th>Jurisdiction</th><th>Classification (NL)</th><th>Role</th></tr>${registerRows}</table>`
      : '';

    // A.2 - Related parties outside the taxpayer side, plus acting together.
    const relatedRows = f.entities
      .filter((e) => e.related && e.role !== 'Taxpayer' && !e.memberOfUnityId && !e.inTaxpayerFiscalUnity)
      .map((e) => {
        // The advisor's edited percentage wins (including an explicit clear);
        // otherwise the chart's direct or via-parent interest is shown.
        const interest = e.edits?.relatedPct !== undefined
          ? (effRelatedPct(e) != null ? `${effRelatedPct(e)}%` : '')
          : e.ownershipPct != null
            ? `${e.ownershipPct}%`
            : (e.relatedVia && e.relatedViaPct != null)
              ? `via ${esc(entityName(e.relatedVia))} (${e.relatedViaPct}%)`
              : '';
        const role = effRelationType(e)
          ?? (e.role === 'Group entity' ? (e.shareholderOfTaxpayer ? 'Shareholder' : 'Other') : e.role);
        return `<tr><td>${esc(e.name)}</td><td>${esc(role)}</td><td>${interest}</td></tr>`;
      }).join('');
    const relatedTable = relatedRows
      ? `<table><tr><th>Entity</th><th>Role</th><th>Interest</th></tr>${relatedRows}</table>`
      : `<p class="accounted">No related parties outside the taxpayer.</p>`;

    const atItems = f.actingTogether.map((a) => {
      const members = a.memberEntityIds.map((mid) => entityName(mid)).join(', ');
      const title = a.name?.trim() ? esc(a.name.trim()) : esc(members);
      const memberSuffix = a.name?.trim() ? ` (${esc(members)})` : '';
      const basis = a.basis ? ` &middot; ${esc(actingBasisLabel(a.basis))}` : '';
      const excludedFlag = (internal && a.excludedFromClient) ? ` <span class="flag">excluded</span>` : '';
      return `<li><strong>${title}</strong>${memberSuffix}${basis}${excludedFlag}: ${esc(a.reasoning)}</li>`;
    }).join('');
    // Clusters the advisor left out of the annex never reach the client
    // (factsForClient drops them), and no "candidate grouping was considered"
    // accounting line prints anywhere (handoff 68, fix 2).
    const atBlock = (!drop('actingTogether') && atItems)
      ? `<h3>Acting together</h3><ul>${atItems}</ul>`
      : '';
    const relatedBlock = !drop('relatedness')
      ? `<h2>A.2 · Related parties</h2>` + narrative('related') + relatedTable + atBlock
      : '';

    // A.4 - Relevant flows, with the non-relevant ones accounted per reason.
    const relevantRows = relevantTransactions(f).map((t) => {
      const excludedFlag = (internal && t.excludedFromClient) ? ` <span class="flag">excluded</span>` : '';
      const proposedFlag = (internal && t.status === 'proposed') ? ` <span class="flag">proposed</span>` : '';
      const idCol = internal ? `<td class="c-num">${esc(t.id)}</td>` : '';
      return (
        `<tr class="${(internal && t.excludedFromClient) ? 'excluded' : ''}">` +
        idCol +
        `<td>${esc(entityName(t.fromEntityId))} &rarr; ${esc(entityName(t.toEntityId))}</td>` +
        `<td>${esc(t.kind)}</td>` +
        `<td>${esc(t.instrument)}</td>` +
        `<td>${esc(txMemoReason(f, t))}</td>` +
        `<td>${t.articlesTested.map(esc).join(', ')}${excludedFlag}${proposedFlag}</td></tr>`
      );
    }).join('');
    const accountedTx = accountedTransactionGroups(f);
    const txIdHeader = internal ? `<th class="c-num">Ref</th>` : '';
    const flowsNarrative = narrative('flows');
    const flowsTable = relevantRows
      ? `<table><tr>${txIdHeader}<th>Transaction</th><th>Type</th><th>Instrument</th><th>Why relevant</th><th>Article(s)</th></tr>${relevantRows}</table>`
      : ((accountedTx.length > 0 || flowsNarrative) ? `<p class="accounted">No relevant intra-group transactions identified.</p>` : '');
    const accountedTxLines = accountedTx.map((g) =>
      `<p class="accounted">${g.transactions.length} ${g.transactions.length === 1 ? 'transaction' : 'transactions'}, no risk identified: ${esc(g.reason)}</p>`,
    ).join('');
    const flowsBlock = (!drop('transactions') && (flowsNarrative || flowsTable || accountedTxLines))
      ? `<h2>A.4 · Relevant transactions</h2>` + flowsNarrative + flowsTable + accountedTxLines
      : '';

    // A.3 - Classification of the relevant entities only; the rest is accounted.
    const scope = inScopeEntityIds(f);
    const clsByEntity = new Map(f.classifications.map((c) => [c.entityId, c]));
    const inScopeEnts = f.entities.filter((e) => scope.has(e.id));
    const clsRows = inScopeEnts.map((e) => {
      const c = clsByEntity.get(e.id);
      const localQ = effLocalQualification(e, c);
      // A Dutch entity's local view equals its NL classification, unless the
      // advisor added a foreign classification (then it shows that other state's
      // view + country); a foreign entity shows its home-state qualification.
      const foreign = dutchForeignClassification(e, c);
      const local = (effJurisdiction(e) ?? '').toUpperCase() === 'NL'
        ? (foreign
            ? `${esc(nlQualificationLabel(foreign.qual))} (${esc(foreign.state)})`
            : esc(nlQualificationLabel(localQ)))
        : c
          ? `${esc(nlQualificationLabel(localQ))}${c.homeState ? ` (${esc(c.homeState)})` : ''}`
          : 'To be determined';
      const mismatch = entityHasQualificationDifference(e, c);
      return (
        `<tr><td>${esc(e.name)}</td>` +
        `<td>${esc(nlQualificationLabel(effNlQualification(e)))}</td>` +
        `<td>${local}</td>` +
        `<td>${mismatch ? '<strong>Yes</strong>' : 'No'}</td></tr>`
      );
    }).join('');
    const outCount = f.entities.length - inScopeEnts.length;
    const outOfScopeLine = outCount > 0
      ? `<p class="accounted">The remaining ${outCount} group ${outCount === 1 ? 'entity is' : 'entities are'} not party to a relevant transaction and ${outCount === 1 ? 'carries' : 'carry'} no qualification difference.</p>`
      : '';
    const classBlock = (!drop('classification') && clsRows)
      ? `<h2>A.3 · Classification of the relevant entities</h2>` + narrative('classification') +
        `<table><tr><th>Entity</th><th>NL qualification</th><th>Local qualification</th><th>Mismatch?</th></tr>${clsRows}</table>` + outOfScopeLine
      : '';

    if (!registerBlock && !relatedBlock && !flowsBlock && !classBlock) return '';
    return `<h2 style="font-size:13px;margin-top:0;">Part A &middot; Entity classification &amp; relatedness</h2>${strip}${registerBlock}${relatedBlock}${classBlock}${flowsBlock}<hr style="margin:14px 0;border:none;border-top:1px solid #ccc;">`;
  })();

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>ATAD2 technical appendix</title>
<style>
  @page { margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11px; line-height: 1.35; }
  h1 { font-size: 17px; margin: 0 0 4px; }
  h2 { font-size: 12px; margin: 16px 0 4px; break-after: avoid; }
  h3 { font-size: 11px; margin: 8px 0 3px; }
  .narrative { color: #444; font-style: italic; margin: 2px 0 6px; }
  .accounted { color: #666; font-size: 10px; margin: 2px 0 8px; }
  tr.taxpayer td { background: #f4f4f5; }
  .banner { border: 1px solid #e0c84a; background: #fff7d6; color: #5b4b00; padding: 6px 10px; border-radius: 4px; margin: 8px 0 14px; }
  table { border-collapse: collapse; width: 100%; margin-bottom: 6px; }
  th, td { border: 1px solid #aaa; padding: 4px 6px; text-align: left; vertical-align: top; }
  th { background: #eee; font-weight: 600; }
  tr { break-inside: avoid; }
  tr.excluded { opacity: 0.55; }
  .c-num { width: 34px; white-space: nowrap; }
  .c-basis { width: 16%; }
  .c-status { width: 92px; font-weight: 600; }
  .c-reason { width: 34%; }
  .c-prov { width: 16%; color: #555; font-size: 10px; background: #fafafa; }
  .flag { color: #6b7280; font-size: 9px; white-space: nowrap; font-weight: 400; }
  .gate-note { color: #111; font-weight: 400; }
</style></head><body>
<h1>ATAD2 technical appendix</h1>
${banner}
${partA}
${body}
</body></html>`;
}
