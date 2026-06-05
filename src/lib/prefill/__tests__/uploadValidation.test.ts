import { describe, it, expect } from 'vitest';
import { isAcceptedUpload, isRtfFile, isExcelFile, isPptxFile } from '../types';

describe('isAcceptedUpload', () => {
  it('accepts .rtf whatever MIME the browser reports', () => {
    for (const type of ['application/rtf', 'text/rtf', 'application/msword', '']) {
      expect(isAcceptedUpload({ name: 'CIT return 2024 (draft).rtf', type })).toBe(true);
    }
  });

  it('accepts .xlsx / .xlsm whatever MIME the browser reports', () => {
    for (const type of [
      'application/vnd.ms-excel.sheet.macroEnabled.12',
      'application/vnd.ms-excel',
      'application/octet-stream',
      '',
    ]) {
      expect(isAcceptedUpload({ name: 'CIT workfile 2024.xlsm', type })).toBe(true);
    }
    expect(isAcceptedUpload({ name: 'Balance Sheet.xlsx', type: '' })).toBe(true);
  });

  it('accepts .pptx whatever MIME the browser reports', () => {
    for (const type of [
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      'application/octet-stream',
      '',
    ]) {
      expect(isAcceptedUpload({ name: 'Group structure.pptx', type })).toBe(true);
    }
  });

  it('keeps accepting the standard MIME allow-list', () => {
    expect(isAcceptedUpload({ name: 'x.pdf', type: 'application/pdf' })).toBe(true);
    expect(isAcceptedUpload({ name: 'x.png', type: 'image/png' })).toBe(true);
    expect(isAcceptedUpload({ name: 'x.csv', type: 'text/csv' })).toBe(true);
  });

  it('rejects formats we cannot parse (legacy .doc/.xls binaries, zip)', () => {
    expect(isAcceptedUpload({ name: 'old.doc', type: 'application/msword' })).toBe(false);
    expect(isAcceptedUpload({ name: 'old.xls', type: 'application/vnd.ms-excel' })).toBe(false);
    expect(isAcceptedUpload({ name: 'archive.zip', type: 'application/zip' })).toBe(false);
  });
});

describe('isRtfFile / isExcelFile', () => {
  it('isRtfFile matches only .rtf by extension or RTF MIME', () => {
    expect(isRtfFile({ name: 'a.rtf', type: '' })).toBe(true);
    expect(isRtfFile({ name: 'a.txt', type: 'application/rtf' })).toBe(true);
    expect(isRtfFile({ name: 'a.doc', type: 'application/msword' })).toBe(false);
  });

  it('isExcelFile matches only .xlsx/.xlsm, not legacy .xls', () => {
    expect(isExcelFile({ name: 'a.xlsx', type: '' })).toBe(true);
    expect(isExcelFile({ name: 'a.xlsm', type: '' })).toBe(true);
    expect(isExcelFile({ name: 'a.xls', type: 'application/vnd.ms-excel' })).toBe(false);
  });

  it('isPptxFile matches .pptx by extension or MIME, not legacy .ppt', () => {
    expect(isPptxFile({ name: 'a.pptx', type: '' })).toBe(true);
    expect(isPptxFile({ name: 'a.ppt', type: 'application/vnd.ms-powerpoint' })).toBe(false);
  });
});
