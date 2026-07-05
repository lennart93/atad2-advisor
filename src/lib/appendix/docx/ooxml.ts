// Minimal WordprocessingML (OOXML) builders.
//
// These produce a string of block-level Word markup (paragraphs and tables) that
// is injected into the memo .docx through a single docxtemplater raw-XML
// placeholder ({{@appendicesXml}}). Building the tables here, in plain testable
// TypeScript, keeps the appendices verifiable against the on-screen data and
// avoids hand-authoring fragile table loops inside the binary template.
//
// Everything is pure and dependency-free so it can be unit-tested without
// rendering a real document. The output references named Word styles that the
// memo template already defines (Heading1/2/3, Normal, TableGrid).
//
// Child-element order follows the OOXML schema (CT_RPr, CT_PPr, CT_TcPr,
// CT_TrPr, CT_TblPr) because the markup is injected raw and Word rejects a
// document whose properties are out of sequence.

/**
 * Remove characters XML 1.0 forbids anywhere: the C0 controls except TAB/LF/CR,
 * U+FFFE/U+FFFF, and unpaired surrogates. A single one (common in PDF/Office
 * paste or model output) would otherwise make Word refuse to open the document,
 * because this markup is injected raw and never re-validated by docxtemplater.
 */
function stripXmlIllegal(s: string): string {
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue; // C0 controls
    if (code === 0xfffe || code === 0xffff) continue;
    if (code >= 0xd800 && code <= 0xdbff) {
      // High surrogate: keep only if followed by a valid low surrogate.
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += s[i] + s[i + 1];
        i++;
      }
      continue;
    }
    if (code >= 0xdc00 && code <= 0xdfff) continue; // lone low surrogate
    out += s[i];
  }
  return out;
}

/** Escape text for an XML text node (illegal chars stripped first). */
export function esc(s: string | null | undefined): string {
  return stripXmlIllegal(String(s ?? ''))
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** Escape text for an XML attribute value. */
export function escAttr(s: string | null | undefined): string {
  return esc(s).replace(/"/g, '&quot;');
}

export interface RunOpts {
  bold?: boolean;
  italic?: boolean;
  /** Hex colour without the leading # (e.g. "455F5B"). */
  color?: string;
  /** Letter-spacing in twentieths of a point (w:spacing); used for caps eyebrows. */
  spacing?: number;
  /** Font size in half-points (w:sz / w:szCs); omit to inherit the style size. */
  sz?: number;
}

/** A single run. Newlines in the text become Word line breaks. */
export function run(text: string, opts: RunOpts = {}): string {
  // CT_RPr child order: b, i, color, spacing, sz, szCs.
  const rPr =
    (opts.bold ? '<w:b/>' : '') +
    (opts.italic ? '<w:i/>' : '') +
    (opts.color ? `<w:color w:val="${escAttr(opts.color)}"/>` : '') +
    (opts.spacing != null ? `<w:spacing w:val="${opts.spacing}"/>` : '') +
    (opts.sz != null ? `<w:sz w:val="${opts.sz}"/><w:szCs w:val="${opts.sz}"/>` : '');
  const rPrXml = rPr ? `<w:rPr>${rPr}</w:rPr>` : '';
  const body = String(text ?? '')
    .split('\n')
    .map((seg, i) => `${i > 0 ? '<w:br/>' : ''}<w:t xml:space="preserve">${esc(seg)}</w:t>`)
    .join('');
  return `<w:r>${rPrXml}${body}</w:r>`;
}

export interface ParaOpts {
  /** A paragraph style id defined in the template (e.g. "Heading1"). */
  style?: string;
  pageBreakBefore?: boolean;
  /** A right tab stop at this DXA position; pair with a TAB run to right-align a trailing run. */
  tabRight?: number;
  /** Spacing before the paragraph, in twentieths of a point. */
  spacingBefore?: number;
  /** Spacing after the paragraph, in twentieths of a point. */
  spacingAfter?: number;
  /** Line spacing in twentieths of a point (lineRule "auto"); 264 ≈ 1.1 lines. */
  line?: number;
}

/** A run holding a single tab character (jumps to the paragraph's next tab stop). */
export const TAB = '<w:r><w:tab/></w:r>';

function spacingTag(opts: ParaOpts): string {
  const { spacingBefore: b, spacingAfter: a, line } = opts;
  if (b == null && a == null && line == null) return '';
  return (
    '<w:spacing' +
    (b != null ? ` w:before="${b}"` : '') +
    (a != null ? ` w:after="${a}"` : '') +
    (line != null ? ` w:line="${line}" w:lineRule="auto"` : '') +
    '/>'
  );
}

/** A paragraph from already-built run XML. */
export function para(runsXml: string, opts: ParaOpts = {}): string {
  // CT_PPr child order: pStyle, pageBreakBefore, tabs, spacing.
  const pPr =
    (opts.style ? `<w:pStyle w:val="${escAttr(opts.style)}"/>` : '') +
    (opts.pageBreakBefore ? '<w:pageBreakBefore/>' : '') +
    (opts.tabRight != null ? `<w:tabs><w:tab w:val="right" w:pos="${opts.tabRight}"/></w:tabs>` : '') +
    spacingTag(opts);
  const pPrXml = pPr ? `<w:pPr>${pPr}</w:pPr>` : '';
  return `<w:p>${pPrXml}${runsXml}</w:p>`;
}

/** A paragraph holding a single plain-text run. */
export function textPara(text: string, opts: ParaOpts & RunOpts = {}): string {
  return para(run(text, opts), opts);
}

/** An empty paragraph. Word needs one between two tables and after a trailing table. */
export function emptyPara(): string {
  return '<w:p/>';
}

/** Cell margins in DXA; only the provided sides are emitted (the rest inherit
 *  from the table's tblCellMar). */
export interface CellMargins {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
}

export interface Cell {
  /** Plain text content (escaped). Ignored when `runs` or `paras` is given. */
  text?: string;
  /** Pre-built run XML for a single-paragraph cell. Ignored when `paras` is given. */
  runs?: string;
  /** Pre-built full paragraph XML (one or more <w:p>…), for multi-line cells. */
  paras?: string;
  bold?: boolean;
  italic?: boolean;
  /** Run colour, hex without # (applies to the simple text path). */
  color?: string;
  /** Cell background fill, hex without # (e.g. "FBFAF9"). */
  shade?: string;
  /** Merge this many grid columns. */
  gridSpan?: number;
  /** Cell width in DXA. Required for a fixed-layout table to honour columns; for a
   *  gridSpan cell pass the sum of the spanned columns. */
  width?: number;
  align?: 'left' | 'right' | 'center';
  /** A single bottom border (e.g. the terracotta-free teal header underline). */
  bottomBorder?: { color: string; sz: number };
  /** Per-cell margins; left/right usually inherit from the table's tblCellMar. */
  margins?: CellMargins;
  /** Vertical alignment; omit for the OOXML default (top). */
  vAlign?: 'top' | 'center';
  /** Inner paragraph line spacing (simple path); defaults to 240. */
  line?: number;
  /** Inner paragraph spacing-after (simple path); defaults to 20. */
  spacingAfter?: number;
}

// The shared inner children of a margin element. CT_TcMar / CT_TblCellMar child
// order: top, left, bottom, right.
function marChildren(m: CellMargins): string {
  return (
    (m.top != null ? `<w:top w:w="${m.top}" w:type="dxa"/>` : '') +
    (m.left != null ? `<w:left w:w="${m.left}" w:type="dxa"/>` : '') +
    (m.bottom != null ? `<w:bottom w:w="${m.bottom}" w:type="dxa"/>` : '') +
    (m.right != null ? `<w:right w:w="${m.right}" w:type="dxa"/>` : '')
  );
}

function tcMarTag(m?: CellMargins): string {
  return m ? `<w:tcMar>${marChildren(m)}</w:tcMar>` : '';
}

/** A table cell. Always contains at least one paragraph (required by the schema). */
export function cell(c: Cell): string {
  // CT_TcPr child order: tcW, gridSpan, tcBorders, shd, tcMar, vAlign.
  const tcPr =
    '<w:tcPr>' +
    (c.width != null ? `<w:tcW w:w="${c.width}" w:type="dxa"/>` : '') +
    (c.gridSpan ? `<w:gridSpan w:val="${c.gridSpan}"/>` : '') +
    (c.bottomBorder
      ? `<w:tcBorders><w:bottom w:val="single" w:sz="${c.bottomBorder.sz}" w:space="0" w:color="${escAttr(c.bottomBorder.color)}"/></w:tcBorders>`
      : '') +
    (c.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${escAttr(c.shade)}"/>` : '') +
    tcMarTag(c.margins) +
    (c.vAlign === 'center' ? '<w:vAlign w:val="center"/>' : '') +
    '</w:tcPr>';
  if (c.paras != null) return `<w:tc>${tcPr}${c.paras}</w:tc>`;
  const jc = c.align && c.align !== 'left' ? `<w:jc w:val="${c.align}"/>` : '';
  const pPr = `<w:pPr><w:spacing w:after="${c.spacingAfter ?? 20}" w:line="${c.line ?? 240}" w:lineRule="auto"/>${jc}</w:pPr>`;
  const inner = c.runs != null ? c.runs : run(c.text ?? '', { bold: c.bold, italic: c.italic, color: c.color });
  return `<w:tc>${tcPr}<w:p>${pPr}${inner}</w:p></w:tc>`;
}

export interface RowOpts {
  /** Repeat this row as a header on every page the table spans. */
  header?: boolean;
  /** Keep the row on one page when it fits (Word still breaks rows taller than a page). */
  cantSplit?: boolean;
  /** Row height hint in DXA (w:trHeight, "at least"). */
  height?: number;
}

export function row(cells: string[], opts: RowOpts = {}): string {
  // CT_TrPr child order: cantSplit, trHeight, tblHeader.
  const trPrInner =
    (opts.cantSplit ? '<w:cantSplit/>' : '') +
    (opts.height != null ? `<w:trHeight w:val="${opts.height}"/>` : '') +
    (opts.header ? '<w:tblHeader/>' : '');
  const trPr = trPrInner ? `<w:trPr>${trPrInner}</w:trPr>` : '';
  return `<w:tr>${trPr}${cells.join('')}</w:tr>`;
}

/** Border style for {@link table}: a full grey grid, or only light horizontal hairlines. */
export type TableBorders = 'grid' | 'hairline';

export interface TableOpts {
  /** "grid" = thin grey box on every edge; "hairline" = horizontal rules only (SAA house style). */
  borders?: TableBorders;
  /** Hairline rule colour, hex without # (default the house-style E7E5E1). */
  hairlineColor?: string;
  /** Default cell margins for the whole table (cells may still override per side). */
  cellMargins?: CellMargins;
}

function tblBorders(style: TableBorders, hairlineColor = 'E7E5E1'): string {
  if (style === 'hairline') {
    // Light warm-grey horizontal hairlines between rows and under the table; no
    // box, no vertical rules — the Svalner Atlas table convention.
    return (
      '<w:tblBorders>' +
      '<w:top w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
      '<w:left w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
      `<w:bottom w:val="single" w:sz="4" w:space="0" w:color="${escAttr(hairlineColor)}"/>` +
      '<w:right w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
      `<w:insideH w:val="single" w:sz="4" w:space="0" w:color="${escAttr(hairlineColor)}"/>` +
      '<w:insideV w:val="none" w:sz="0" w:space="0" w:color="auto"/>' +
      '</w:tblBorders>'
    );
  }
  return (
    '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`)
      .join('') +
    '</w:tblBorders>'
  );
}

/**
 * A fixed-layout, full-width table. `colWidths` are DXA widths that must sum to the
 * section content width; fixed layout makes Word honour them (and the per-cell tcW)
 * instead of autofitting, which is what stops long assessment text from collapsing
 * the other columns. Percentage widths are deliberately avoided for Word + Google
 * Docs compatibility.
 */
export function table(rows: string[], colWidths: number[], opts: TableOpts = {}): string {
  const total = colWidths.reduce((a, b) => a + b, 0);
  const grid = `<w:tblGrid>${colWidths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  const cellMar = opts.cellMargins ? `<w:tblCellMar>${marChildren(opts.cellMargins)}</w:tblCellMar>` : '';
  // CT_TblPr order: tblStyle, tblW, tblBorders, tblLayout, tblCellMar, tblLook.
  const tblPr =
    '<w:tblPr>' +
    '<w:tblStyle w:val="TableGrid"/>' +
    `<w:tblW w:w="${total}" w:type="dxa"/>` +
    tblBorders(opts.borders ?? 'grid', opts.hairlineColor) +
    '<w:tblLayout w:type="fixed"/>' +
    cellMar +
    '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>' +
    '</w:tblPr>';
  return `<w:tbl>${tblPr}${grid}${rows.join('')}</w:tbl>`;
}
