import { APPENDIX_SKELETON } from './skeleton';
import type { AppendixRow } from './types';

const esc = (s: string | null) => (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const LABEL = new Map(APPENDIX_SKELETON.map((r) => [r.rowId, r.legalFramework]));

/**
 * Full, print-friendly HTML for the whole appendix: every section and row,
 * grouped like the on-screen table, with nothing clipped by a scroll container.
 * The internal Reference column is included only when showRefs is true.
 */
export function buildAppendixPrintHtml(rows: AppendixRow[], showRefs: boolean): string {
  const byId = new Map(rows.map((r) => [r.rowId, r]));
  const sections: { id: string; title: string; rows: AppendixRow[] }[] = [];
  for (const sk of APPENDIX_SKELETON) {
    const row = byId.get(sk.rowId);
    if (!row) continue;
    let s = sections.find((x) => x.id === sk.sectionId);
    if (!s) {
      s = { id: sk.sectionId, title: sk.sectionTitle, rows: [] };
      sections.push(s);
    }
    s.rows.push(row);
  }

  const header =
    `<tr><th class="c-num">#</th><th>Legal framework</th><th class="c-dec">Decision</th><th>Reasoning</th>` +
    (showRefs ? `<th class="c-ref">Reference (internal)</th>` : '') +
    `</tr>`;

  const body = sections
    .map((s) => {
      const rowsHtml = s.rows
        .map((r) => {
          const fw = esc(LABEL.get(r.rowId) ?? r.rowId);
          const flag = r.stale ? ` <span class="flag">review again</span>` : '';
          const ref = showRefs ? `<td class="c-ref">${esc(r.reference)}</td>` : '';
          return (
            `<tr><td class="c-num">${esc(r.rowId)}</td><td>${fw}</td>` +
            `<td>${esc(r.decision)}${flag}</td><td>${esc(r.reasoning)}</td>${ref}</tr>`
          );
        })
        .join('');
      return `<h2>Section ${esc(s.id)}. ${esc(s.title)}</h2><table>${header}${rowsHtml}</table>`;
    })
    .join('\n');

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
  .c-num { width: 40px; white-space: nowrap; }
  .c-dec { width: 130px; }
  .c-ref { width: 22%; color: #555; font-size: 10px; background: #fafafa; }
  .flag { color: #b45309; font-size: 9px; white-space: nowrap; }
</style></head><body>
<h1>ATAD2 technical appendix (technische bijlage)</h1>
<div class="banner"><strong>Draft, pending tax review.</strong> Internal working copy${showRefs ? ', includes internal references' : ''}. This banner also appears on the export.</div>
${body}
</body></html>`;
}
