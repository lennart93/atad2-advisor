import { APPENDIX_SKELETON } from './skeleton';
import { statusPrintColor } from './status';
import type { AppendixRow, SkeletonRow, Status } from './types';

const esc = (s: string | null) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Which artifact to render. */
export type PrintMode = 'internal' | 'dossier';

/**
 * Full, print-friendly HTML for the whole appendix: every section and row,
 * grouped like the on-screen table, with nothing clipped by a scroll container.
 *
 * 'internal' is the working copy: it keeps the raw provenance column.
 * 'dossier' is the clean client/file version: legal basis + condition + status +
 * legal consequence + the verifiable factual basis, with no internal ids.
 */
export function buildAppendixPrintHtml(
  rows: AppendixRow[],
  mode: PrintMode,
  skeleton: SkeletonRow[] = APPENDIX_SKELETON,
): string {
  const internal = mode === 'internal';
  const byId = new Map(rows.map((r) => [r.rowId, r]));
  const skById = new Map(skeleton.map((s) => [s.rowId, s]));

  const sections: { id: string; title: string; rows: AppendixRow[] }[] = [];
  for (const sk of skeleton) {
    const row = byId.get(sk.rowId);
    if (!row) continue;
    let s = sections.find((x) => x.id === sk.sectionId);
    if (!s) {
      s = { id: sk.sectionId, title: sk.sectionTitle, rows: [] };
      sections.push(s);
    }
    s.rows.push(row);
  }

  const statusCell = (status: Status | null, flag: string) => {
    const { bg, fg } = statusPrintColor(status);
    return `<td class="c-status" style="background:${bg};color:${fg};">${esc(status)}${flag}</td>`;
  };

  const header =
    `<tr><th class="c-num">#</th><th class="c-basis">Legal basis</th><th>Condition tested</th>` +
    `<th class="c-status">Status</th><th class="c-cons">Legal consequence</th><th class="c-fact">Factual basis</th>` +
    (internal ? `<th class="c-prov">Provenance (internal)</th>` : '') +
    `</tr>`;

  const body = sections
    .map((s) => {
      const rowsHtml = s.rows
        .map((r) => {
          const sk = skById.get(r.rowId);
          const flag = r.stale ? ` <span class="flag">review again</span>` : '';
          const prov = internal ? `<td class="c-prov">${esc(r.provenance)}</td>` : '';
          return (
            `<tr><td class="c-num">${esc(r.rowId)}</td>` +
            `<td class="c-basis">${esc(sk?.legalBasis ?? r.rowId)}</td>` +
            `<td>${esc(sk?.conditionTested ?? '')}</td>` +
            statusCell(r.status, flag) +
            `<td>${esc(r.consequence)}</td>` +
            `<td class="c-fact">${esc(r.factualBasis)}</td>${prov}</tr>`
          );
        })
        .join('');
      return `<h2>Section ${esc(s.id)}. ${esc(s.title)}</h2><table>${header}${rowsHtml}</table>`;
    })
    .join('\n');

  const banner = internal
    ? `<div class="banner"><strong>Draft, pending tax review.</strong> Internal working copy, includes internal references. Do not share this version externally.</div>`
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
  .c-num { width: 34px; white-space: nowrap; }
  .c-basis { width: 16%; }
  .c-status { width: 92px; font-weight: 600; }
  .c-cons { width: 20%; }
  .c-fact { width: 20%; }
  .c-prov { width: 16%; color: #555; font-size: 10px; background: #fafafa; }
  .flag { color: #b45309; font-size: 9px; white-space: nowrap; font-weight: 400; }
</style></head><body>
<h1>ATAD2 technical appendix</h1>
${banner}
${body}
</body></html>`;
}
