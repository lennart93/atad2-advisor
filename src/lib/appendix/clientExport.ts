import type { AppendixRow, SkeletonRow } from './types';

export interface ClientRow {
  rowId: string;       // stable skeleton id (internal)
  displayCode: string; // renumbered code shown to the client, e.g. "3.2"
  sk: SkeletonRow;
  row: AppendixRow;
}
export interface ClientSection {
  displayNum: number;
  sectionId: string;
  sectionTitle: string;
  rows: ClientRow[];
}

/**
 * Client/dossier ordering: drop rows the advisor excluded, then renumber the
 * surviving sections (1..K) and the rows within each (1..n), so the client sees a
 * contiguous numbering with no gaps. Walks the skeleton order.
 */
export function buildClientSections(rows: AppendixRow[], skeleton: SkeletonRow[]): ClientSection[] {
  const byId = new Map(rows.map((r) => [r.rowId, r]));
  const sections: ClientSection[] = [];
  let sectionNum = 0;
  for (const sk of skeleton) {
    const row = byId.get(sk.rowId);
    if (!row || row.excludedFromClient) continue;
    let s = sections.find((x) => x.sectionId === sk.sectionId);
    if (!s) {
      sectionNum += 1;
      s = { displayNum: sectionNum, sectionId: sk.sectionId, sectionTitle: sk.sectionTitle, rows: [] };
      sections.push(s);
    }
    s.rows.push({ rowId: sk.rowId, displayCode: `${s.displayNum}.${s.rows.length + 1}`, sk, row });
  }
  return sections;
}
