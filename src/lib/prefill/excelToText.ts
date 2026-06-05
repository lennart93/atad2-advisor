// Excel (.xlsx / .xlsm) -> plain-text extractor for LLM prefill.
//
// .xlsx and .xlsm share the same Office Open XML (zipped) format; .xlsm only
// adds a macro part, which we ignore. We extract each worksheet to a CSV-style
// block in the browser and upload the result as text/plain, the same way DOCX
// and RTF are handled (see useUploadDocument). Done in the browser because the
// Supabase edge runtime's wall-clock limit makes server-side workbook parsing
// risky, and because the analyze pipeline only knows how to read text.
//
// Uses exceljs, which is already a dependency (admin export). It is dynamically
// imported so it never lands in the main bundle.

// Keep the extracted text bounded so a large, wide workbook can't blow the
// prefill prompt's token budget. Dense numeric grids compress well in OOXML, so
// a workbook within the 15 MB file cap can still expand to many MB of text.
const MAX_CHARS = 400_000;

/**
 * Convert a single exceljs cell value to a flat string. exceljs returns rich
 * shapes for formulas, hyperlinks, rich text, dates and errors; we reduce each
 * to the text a reader cares about (formula results over the formula itself).
 * `numFmt` is the cell's number format, used to keep percentages readable.
 */
export function excelCellToText(value: unknown, numFmt?: string): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "bigint") {
    return formatNumber(Number(value), numFmt);
  }
  if (typeof value === "boolean") return String(value);
  if (value instanceof Date) return formatExcelDate(value);

  if (typeof value === "object") {
    const v = value as Record<string, unknown>;
    // Formula / shared-formula cell: prefer the computed result over the formula.
    if ("result" in v) return excelCellToText(v.result, numFmt);
    if ("formula" in v || "sharedFormula" in v) return "";
    // Rich text runs.
    if (Array.isArray(v.richText)) {
      return (v.richText as Array<{ text?: unknown }>).map((r) => excelCellToText(r?.text)).join("");
    }
    // Hyperlink cell: show the visible label, fall back to the URL.
    if ("hyperlink" in v) return excelCellToText("text" in v ? v.text : v.hyperlink);
    // Error cell (e.g. #DIV/0!).
    if ("error" in v) return String(v.error);
  }
  return "";
}

// Render a percentage stored as a fraction (0.075 with "0.00%") as "7.50%" so
// the model does not read a rate as a factor-of-100-smaller decimal, and glue a
// detected currency symbol onto an amount (1234.5 with "$#,##0.00" -> "$1234.5")
// so a money column is not mistaken for a bare count. The numeric value itself
// is always kept verbatim; only percentages are rescaled, and thousands
// separators are dropped because the raw number is already unambiguous.
function formatNumber(value: number, numFmt?: string): string {
  if (numFmt) {
    // Drop quoted literals / escaped chars so a literal "%" or symbol is not
    // mistaken for a format token.
    const cleaned = numFmt.replace(/"[^"]*"/g, "").replace(/\\./g, "");
    if (cleaned.includes("%")) {
      const m = cleaned.match(/\.(0+)/);
      const decimals = m ? m[1].length : 0;
      return `${(value * 100).toFixed(decimals)}%`;
    }
    const sym = currencySymbol(numFmt);
    if (sym) return `${sym}${value}`;
  }
  return String(value);
}

// Currency symbol carried by a number format, or null. Handles the Excel locale
// form [$€-413] / [$$-409] and a bare symbol on the mask ($#,##0.00). The bare
// scan runs only after bracket + quoted sections are removed, so a locale-only
// marker like [$-409] is never misread as a dollar sign.
function currencySymbol(numFmt: string): string | null {
  const bracket = numFmt.match(/\[\$([^\-\]]+)(?:-[0-9A-Fa-f]+)?\]/);
  if (bracket?.[1]) return bracket[1];
  const bare = numFmt.replace(/\[[^\]]*\]/g, "").replace(/"[^"]*"/g, "");
  for (const sym of ["€", "$", "£", "¥"]) if (bare.includes(sym)) return sym;
  return null;
}

function formatExcelDate(d: Date): string {
  const t = d.getTime();
  if (Number.isNaN(t)) return "";
  const iso = d.toISOString();
  // Date-only cells (midnight UTC) read better without the time component.
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso;
}

function csvEscape(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Convert a workbook ArrayBuffer (.xlsx or .xlsm) into plain text, one CSV
 * block per non-empty visible sheet. Returns the empty string if there is no
 * data. Output is capped at MAX_CHARS with a truncation marker.
 */
export async function excelToText(buffer: ArrayBuffer, maxChars: number = MAX_CHARS): Promise<string> {
  const ExcelJS = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);

  const parts: string[] = [];
  let totalChars = 0;
  let truncated = false;

  wb.eachSheet((ws) => {
    if (truncated) return;
    if (ws.state && ws.state !== "visible") return; // skip hidden / veryHidden sheets

    const rows: string[] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      if (truncated) return;
      const cells: string[] = [];
      for (let c = 1; c <= row.cellCount; c++) {
        const cell = row.getCell(c);
        // Merged cells share the master's value; emit it once, not per column.
        if (cell.isMerged && cell.master !== cell) { cells.push(""); continue; }
        cells.push(excelCellToText(cell.value, cell.numFmt));
      }
      while (cells.length && cells[cells.length - 1] === "") cells.pop();
      if (cells.length === 0) return; // skip rows that are entirely empty
      const line = cells.map(csvEscape).join(",");
      rows.push(line);
      totalChars += line.length + 1;
      if (totalChars > maxChars) truncated = true;
    });
    if (rows.length) parts.push(`### Sheet: ${ws.name}\n\n${rows.join("\n")}`);
  });

  let text = parts.join("\n\n").trim();
  if (truncated) text += "\n\n[workbook text truncated]";
  return text;
}
