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
  /** Hex colour without the leading # (e.g. "808080"). */
  color?: string;
}

/** A single run. Newlines in the text become Word line breaks. */
export function run(text: string, opts: RunOpts = {}): string {
  const rPr =
    (opts.bold ? '<w:b/>' : '') +
    (opts.italic ? '<w:i/>' : '') +
    (opts.color ? `<w:color w:val="${escAttr(opts.color)}"/>` : '');
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
  /** Spacing after the paragraph, in twentieths of a point. */
  spacingAfter?: number;
}

/** A paragraph from already-built run XML. */
export function para(runsXml: string, opts: ParaOpts = {}): string {
  const pPr =
    (opts.style ? `<w:pStyle w:val="${escAttr(opts.style)}"/>` : '') +
    (opts.pageBreakBefore ? '<w:pageBreakBefore/>' : '') +
    (opts.spacingAfter != null ? `<w:spacing w:after="${opts.spacingAfter}"/>` : '');
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

export interface Cell {
  /** Plain text content (escaped). Ignored when `runs` is given. */
  text?: string;
  /** Pre-built run XML, for multi-run or styled cells. */
  runs?: string;
  bold?: boolean;
  italic?: boolean;
  /** Cell background fill, hex without # (e.g. "E7E6E6"). */
  shade?: string;
  /** Merge this many grid columns. */
  gridSpan?: number;
  /** Cell width in DXA. Required for a fixed-layout table to honour columns; for a
   *  gridSpan cell pass the sum of the spanned columns. */
  width?: number;
  align?: 'left' | 'right' | 'center';
}

/** A table cell. Always contains exactly one paragraph (required by the schema). */
export function cell(c: Cell): string {
  // CT_TcPr child order matters: tcW, gridSpan, shd, tcMar, vAlign.
  const tcPr =
    '<w:tcPr>' +
    (c.width != null ? `<w:tcW w:w="${c.width}" w:type="dxa"/>` : '') +
    (c.gridSpan ? `<w:gridSpan w:val="${c.gridSpan}"/>` : '') +
    (c.shade ? `<w:shd w:val="clear" w:color="auto" w:fill="${escAttr(c.shade)}"/>` : '') +
    '<w:tcMar><w:top w:w="40" w:type="dxa"/><w:left w:w="80" w:type="dxa"/><w:bottom w:w="40" w:type="dxa"/><w:right w:w="80" w:type="dxa"/></w:tcMar>' +
    '<w:vAlign w:val="center"/>' +
    '</w:tcPr>';
  const jc = c.align && c.align !== 'left' ? `<w:jc w:val="${c.align}"/>` : '';
  const pPr = `<w:pPr><w:spacing w:after="20" w:line="240" w:lineRule="auto"/>${jc}</w:pPr>`;
  const inner = c.runs != null ? c.runs : run(c.text ?? '', { bold: c.bold, italic: c.italic });
  return `<w:tc>${tcPr}<w:p>${pPr}${inner}</w:p></w:tc>`;
}

export interface RowOpts {
  /** Repeat this row as a header on every page the table spans. */
  header?: boolean;
  /** Keep the row on one page when it fits (Word still breaks rows taller than a page). */
  cantSplit?: boolean;
}

export function row(cells: string[], opts: RowOpts = {}): string {
  // CT_TrPr child order: cantSplit before tblHeader.
  const trPrInner = (opts.cantSplit ? '<w:cantSplit/>' : '') + (opts.header ? '<w:tblHeader/>' : '');
  const trPr = trPrInner ? `<w:trPr>${trPrInner}</w:trPr>` : '';
  return `<w:tr>${trPr}${cells.join('')}</w:tr>`;
}

/**
 * A fixed-layout, full-width table with thin grey borders. `colWidths` are DXA
 * widths that must sum to the section content width; fixed layout makes Word
 * honour them (and the per-cell tcW) instead of autofitting. Percentage widths
 * are deliberately avoided for Word + Google Docs compatibility.
 */
export function table(rows: string[], colWidths: number[]): string {
  const total = colWidths.reduce((a, b) => a + b, 0);
  const grid = `<w:tblGrid>${colWidths.map((w) => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
  const borders =
    '<w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']
      .map((s) => `<w:${s} w:val="single" w:sz="4" w:space="0" w:color="BFBFBF"/>`)
      .join('') +
    '</w:tblBorders>';
  // CT_TblPr order: tblStyle, tblW, tblBorders, tblLayout, tblLook.
  const tblPr =
    '<w:tblPr>' +
    '<w:tblStyle w:val="TableGrid"/>' +
    `<w:tblW w:w="${total}" w:type="dxa"/>` +
    borders +
    '<w:tblLayout w:type="fixed"/>' +
    '<w:tblLook w:val="04A0" w:firstRow="1" w:lastRow="0" w:firstColumn="0" w:lastColumn="0" w:noHBand="0" w:noVBand="1"/>' +
    '</w:tblPr>';
  return `<w:tbl>${tblPr}${grid}${rows.join('')}</w:tbl>`;
}
