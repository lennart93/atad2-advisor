import { APPENDIX_SKELETON } from './skeleton';
import { buildClientSections } from './clientExport';
import { statusPrintColor } from './status';
import type { AppendixRow, RowKind, SkeletonRow, Status } from './types';

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
${body}
</body></html>`;
}
