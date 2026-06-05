import { describe, it, expect } from 'vitest';
import { excelCellToText, excelToText } from '../excelToText';

describe('excelCellToText', () => {
  it('handles primitives', () => {
    expect(excelCellToText(null)).toBe('');
    expect(excelCellToText(undefined)).toBe('');
    expect(excelCellToText('hi')).toBe('hi');
    expect(excelCellToText(42)).toBe('42');
    expect(excelCellToText(0)).toBe('0');
    expect(excelCellToText(true)).toBe('true');
    expect(excelCellToText(false)).toBe('false');
  });

  it('formats dates as an ISO date at midnight, full ISO otherwise', () => {
    expect(excelCellToText(new Date('2024-12-31T00:00:00.000Z'))).toBe('2024-12-31');
    expect(excelCellToText(new Date('2024-12-31T09:30:00.000Z'))).toBe('2024-12-31T09:30:00.000Z');
  });

  it('prefers the formula result over the formula', () => {
    expect(excelCellToText({ formula: 'A1+B1', result: 123 })).toBe('123');
    expect(excelCellToText({ sharedFormula: 'A1', result: 'X' })).toBe('X');
    expect(excelCellToText({ formula: 'A1', result: undefined })).toBe('');
  });

  it('flattens rich text runs', () => {
    expect(excelCellToText({ richText: [{ text: 'Net ' }, { text: 'income' }] })).toBe('Net income');
  });

  it('uses the hyperlink label, falling back to the URL', () => {
    expect(excelCellToText({ text: 'Click', hyperlink: 'http://x' })).toBe('Click');
    expect(excelCellToText({ hyperlink: 'http://x' })).toBe('http://x');
  });

  it('renders error cells, including a formula that resolves to an error', () => {
    expect(excelCellToText({ error: '#DIV/0!' })).toBe('#DIV/0!');
    expect(excelCellToText({ formula: '1/0', result: { error: '#DIV/0!' } })).toBe('#DIV/0!');
  });

  it('renders percentage formats so a rate is not read 100x too small', () => {
    expect(excelCellToText(0.075, '0.00%')).toBe('7.50%');
    expect(excelCellToText(0.5, '0%')).toBe('50%');
    expect(excelCellToText(1, '0%')).toBe('100%');
  });

  it('treats a quoted literal percent as plain and keeps non-percent numbers numeric', () => {
    expect(excelCellToText(50, '0" %"')).toBe('50');       // quoted "%" is not the percent token
    expect(excelCellToText(1234.5, '#,##0.00')).toBe('1234.5');
    expect(excelCellToText(42, 'General')).toBe('42');
  });
});

describe('excelToText (round-trip via exceljs)', () => {
  it('extracts each sheet to CSV-style text with proper escaping', async () => {
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Balans');
    ws.addRow(['Post', 'Bedrag']);
    ws.addRow(['Rentelasten', 1234.5]);
    ws.addRow(['Naam, met komma', 'a"b']);
    const buf = await wb.xlsx.writeBuffer();

    const text = await excelToText(buf as unknown as ArrayBuffer);
    expect(text).toContain('### Sheet: Balans');
    expect(text).toContain('Post,Bedrag');
    expect(text).toContain('Rentelasten,1234.5');
    expect(text).toContain('"Naam, met komma","a""b"');
  });

  it('handles multiple sheets', async () => {
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('S1').addRow(['a', 'b']);
    wb.addWorksheet('S2').addRow(['c', 'd']);
    const buf = await wb.xlsx.writeBuffer();

    const text = await excelToText(buf as unknown as ArrayBuffer);
    expect(text).toContain('### Sheet: S1');
    expect(text).toContain('a,b');
    expect(text).toContain('### Sheet: S2');
    expect(text).toContain('c,d');
  });

  it('emits a merged-cell value once, not duplicated across the span', async () => {
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('S');
    ws.mergeCells('A1:D1');
    ws.getCell('A1').value = 'Consolidated balance';
    ws.addRow(['x', 'y']);
    const buf = await wb.xlsx.writeBuffer();

    const text = await excelToText(buf as unknown as ArrayBuffer);
    const headerLine = text.split('\n').find((l) => l.includes('Consolidated')) ?? '';
    expect(headerLine).toBe('Consolidated balance');
    expect(text).not.toContain('Consolidated balance,Consolidated balance');
  });

  it('returns the empty string for a workbook with no data', async () => {
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Empty');
    const buf = await wb.xlsx.writeBuffer();

    expect(await excelToText(buf as unknown as ArrayBuffer)).toBe('');
  });

  it('skips hidden and very-hidden sheets', async () => {
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet('Visible').addRow(['keep', 'me']);
    const scratch = wb.addWorksheet('Scratch');
    scratch.state = 'veryHidden';
    scratch.addRow(['drop', 'this']);
    const buf = await wb.xlsx.writeBuffer();

    const text = await excelToText(buf as unknown as ArrayBuffer);
    expect(text).toContain('### Sheet: Visible');
    expect(text).toContain('keep,me');
    expect(text).not.toContain('Scratch');
    expect(text).not.toContain('drop,this');
  });

  it('caps output at maxChars and appends a truncation marker', async () => {
    const ExcelJS = await import('exceljs');
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Big');
    for (let i = 0; i < 50; i++) ws.addRow([`row-${i}`, 'x'.repeat(20)]);
    const buf = await wb.xlsx.writeBuffer();

    const text = await excelToText(buf as unknown as ArrayBuffer, 200);
    expect(text).toContain('row-0'); // early rows still extracted
    expect(text).toContain('[workbook text truncated]');
    expect(text).not.toContain('row-49'); // later rows dropped at the cap
    expect(text.length).toBeLessThan(600);
  });
});
