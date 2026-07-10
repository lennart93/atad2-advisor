// @vitest-environment jsdom
//
// Well-formedness guard for the DRAFT watermark: every part the watermark
// touches must still parse as XML, or Word refuses the whole document. Uses
// jsdom's DOMParser (which reports a <parsererror> on invalid XML), hence the
// jsdom environment while the rest of the docx suite runs in node.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PizZip from 'pizzip';
import { applyDraftWatermark } from '@/lib/appendix/docx/draftWatermark';
import { buildMemoAppendicesXml } from '@/lib/appendix/docx/memoAppendices';

const TEMPLATE = resolve(process.cwd(), 'templates/memo_atad2_with_structure_placeholder.docx');

describe('applyDraftWatermark XML well-formedness', () => {
  it('leaves every touched part parseable as XML', () => {
    const zip = new PizZip(readFileSync(TEMPLATE));
    const tail = buildMemoAppendicesXml(null, []);
    zip.file(
      'word/document.xml',
      zip.file('word/document.xml')!.asText().replace('</w:body>', `${tail}</w:body>`),
    );

    applyDraftWatermark(zip);

    const parts = [
      'word/document.xml',
      'word/header1.xml',
      'word/headerDraftWatermark.xml',
      '[Content_Types].xml',
      'word/_rels/document.xml.rels',
    ];
    for (const part of parts) {
      const xml = zip.file(part)!.asText();
      const parsed = new DOMParser().parseFromString(xml, 'text/xml');
      expect(
        parsed.getElementsByTagName('parsererror').length,
        `${part} should be well-formed XML`,
      ).toBe(0);
    }
  });
});
