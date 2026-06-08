import { APPENDIX_SKELETON } from './skeleton';
import { buildClientSections } from './clientExport';
import { statusPrintColor } from './status';
import type { AppendixFacts, AppendixRow, RowKind, SkeletonRow, Status } from './types';
import { factsForClient } from './factsExport';

const esc = (s: string | null) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Which artifact to render. */
export type PrintMode = 'internal' | 'dossier';

interface PrintRow { code: string; legalBasis: string; conditionTested: string; status: Status | null; kind: RowKind; reasoning: string | null; provenance: string | null; stale: boolean; excluded: boolean; }
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

  if (internal) {
    const byId = new Map(rows.map((r) => [r.rowId, r]));
    for (const sk of skeleton) {
      const row = byId.get(sk.rowId);
      if (!row) continue;
      let s = sections.find((x) => x.heading === `Section ${sk.sectionId}. ${sk.sectionTitle}`);
      if (!s) { s = { heading: `Section ${sk.sectionId}. ${sk.sectionTitle}`, rows: [] }; sections.push(s); }
      s.rows.push({
        code: sk.rowId, legalBasis: sk.legalBasis, conditionTested: sk.conditionTested,
        status: row.status, kind: sk.kind, reasoning: row.reasoning, provenance: row.provenance,
        stale: row.stale, excluded: row.excludedFromClient,
      });
    }
  } else {
    for (const cs of buildClientSections(rows, skeleton)) {
      sections.push({
        heading: `Section ${cs.displayNum}. ${cs.sectionTitle}`,
        rows: cs.rows.map((cr) => ({
          code: cr.displayCode, legalBasis: cr.sk.legalBasis, conditionTested: cr.sk.conditionTested,
          status: cr.row.status, kind: cr.sk.kind, reasoning: cr.row.reasoning, provenance: cr.row.provenance,
          stale: cr.row.stale, excluded: false,
        })),
      });
    }
  }

  const statusCell = (status: Status | null, kind: RowKind, flag: string) => {
    const { bg, fg } = statusPrintColor(status, kind);
    return `<td class="c-status" style="background:${bg};color:${fg};">${esc(status)}${flag}</td>`;
  };

  const header =
    `<tr><th class="c-num">#</th><th class="c-basis">Legal basis</th><th>Condition tested</th>` +
    `<th class="c-status">Status</th><th class="c-reason">Reasoning</th>` +
    (internal ? `<th class="c-prov">Provenance (internal)</th>` : '') +
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
            statusCell(r.status, r.kind, flags) +
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

  // ---- Part A: Facts & relationships ----------------------------------------
  const partA = (() => {
    if (!facts || facts.entities.length === 0) return '';
    const f = internal ? facts : factsForClient(facts);

    // Entity register
    const entityById = new Map(f.entities.map((e) => [e.id, e]));
    const entityName = (id: string) => {
      const e = entityById.get(id);
      return e ? e.name : id;
    };

    const entityRows = f.entities.map((e) => {
      const flagCols = internal
        ? `<td class="c-num">${esc(e.id)}</td>`
        : '';
      return (
        `<tr><td>${esc(e.name)}</td>` +
        flagCols +
        `<td>${esc(e.jurisdiction)}</td>` +
        `<td>${esc(e.entityType)}</td>` +
        `<td>${esc(e.role)}</td>` +
        `<td>${e.ownershipPct != null ? `${e.ownershipPct}%` : ''}</td>` +
        `<td>${e.related ? 'Yes' : 'No'}</td>` +
        `<td>${esc(e.nlTaxStatus)}</td></tr>`
      );
    }).join('');
    const entityIdHeader = internal ? `<th class="c-num">Ref</th>` : '';
    const entityTable = entityRows
      ? `<h2>Part A.1 · Entity register</h2>` +
        `<table><tr>${entityIdHeader}<th>Entity</th><th>Jurisdiction</th><th>Type</th><th>Role</th><th>Ownership</th><th>Related (&gt;25%)</th><th>NL tax status</th></tr>${entityRows}</table>`
      : '';

    // Classification matrix
    const classRows = f.classifications.map((c) => {
      const e = entityById.get(c.entityId);
      const name = e ? e.name : c.entityId;
      const hybridFlag = c.hybrid ? ` <span class="flag">hybrid mismatch</span>` : '';
      const excludedFlag = (internal && c.excludedFromClient) ? ` <span class="flag">excluded</span>` : '';
      const proposedFlag = (internal && c.status === 'proposed') ? ` <span class="flag">proposed</span>` : '';
      return (
        `<tr class="${(internal && c.excludedFromClient) ? 'excluded' : ''}">` +
        `<td>${esc(name)}</td>` +
        `<td>${esc(c.homeState)}</td>` +
        `<td>${esc(c.homeClass)}</td>` +
        `<td>${esc(c.sourceState)}</td>` +
        `<td>${esc(c.sourceClass)}${hybridFlag}</td>` +
        `<td>${c.hybrid ? 'Yes' : 'No'}${excludedFlag}${proposedFlag}</td></tr>`
      );
    }).join('');
    const classTable = classRows
      ? `<h2>Part A.2 · Classification matrix</h2>` +
        `<table><tr><th>Entity</th><th>Home state</th><th>Home class</th><th>Source state</th><th>Source class</th><th>Hybrid</th></tr>${classRows}</table>`
      : '';

    // Transaction map
    const txRows = f.transactions.map((t) => {
      const fromName = entityName(t.fromEntityId);
      const toName = entityName(t.toEntityId);
      const excludedFlag = (internal && t.excludedFromClient) ? ` <span class="flag">excluded</span>` : '';
      const proposedFlag = (internal && t.status === 'proposed') ? ` <span class="flag">proposed</span>` : '';
      const idCol = internal ? `<td class="c-num">${esc(t.id)}</td>` : '';
      return (
        `<tr class="${(internal && t.excludedFromClient) ? 'excluded' : ''}">` +
        idCol +
        `<td>${esc(fromName)} &rarr; ${esc(toName)}</td>` +
        `<td>${esc(t.kind)}</td>` +
        `<td>${esc(t.instrument)}</td>` +
        `<td>${t.articlesTested.map(esc).join(', ')}${excludedFlag}${proposedFlag}</td></tr>`
      );
    }).join('');
    const txIdHeader = internal ? `<th class="c-num">Ref</th>` : '';
    const txTable = txRows
      ? `<h2>Part A.3 · Transaction map</h2>` +
        `<table><tr>${txIdHeader}<th>Flow</th><th>Type</th><th>Instrument</th><th>Article(s)</th></tr>${txRows}</table>`
      : '';

    // Acting together
    const atItems = f.actingTogether.map((a) => {
      const members = a.memberEntityIds.map((mid) => entityName(mid)).join(', ');
      const pct = a.combinedPct != null ? ` ≈ ${a.combinedPct}%` : '';
      const excludedFlag = (internal && a.excludedFromClient) ? ` <span class="flag">excluded</span>` : '';
      const proposedFlag = (internal && a.status === 'proposed') ? ` <span class="flag">proposed</span>` : '';
      return `<li>${esc(members)}${pct}${excludedFlag}${proposedFlag} — ${esc(a.rationale)}</li>`;
    }).join('');
    const atBlock = atItems
      ? `<h2>Part A.4 · Acting together</h2><ul>${atItems}</ul>`
      : '';

    if (!entityTable && !classTable && !txTable && !atBlock) return '';
    return `<h2 style="font-size:13px;margin-top:0;">Part A &middot; Facts &amp; relationships</h2>${entityTable}${classTable}${txTable}${atBlock}<hr style="margin:14px 0;border:none;border-top:1px solid #ccc;">`;
  })();

  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>ATAD2 technical appendix</title>
<style>
  @page { margin: 16mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11px; line-height: 1.35; }
  h1 { font-size: 17px; margin: 0 0 4px; }
  h2 { font-size: 12px; margin: 16px 0 4px; break-after: avoid; }
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
  .flag { color: #b45309; font-size: 9px; white-space: nowrap; font-weight: 400; }
</style></head><body>
<h1>ATAD2 technical appendix</h1>
${banner}
${partA}
${body}
</body></html>`;
}
