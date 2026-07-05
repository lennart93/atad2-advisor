import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PizZip from 'pizzip';
import {
  simplifyFooterPageNumber,
  removeExtraBlankParagraphs,
  preprocessMemoTemplate,
} from '@/lib/appendix/docx/memoTemplatePatches';

const TEMPLATE = resolve(process.cwd(), 'templates/memo_atad2_with_structure_placeholder.docx');
const zipOf = () => new PizZip(readFileSync(TEMPLATE));
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

describe('simplifyFooterPageNumber', () => {
  const footer = () => zipOf().file('word/footer1.xml')!.asText();

  it('drops the SECTIONPAGES total but keeps the PAGE field', () => {
    const before = footer();
    expect(before).toContain('SECTIONPAGES');
    expect(before).toContain('>PAGE'); // the PAGE field's instrText

    const after = simplifyFooterPageNumber(before);
    expect(after).not.toContain('SECTIONPAGES');
    expect(after).toContain('>PAGE'); // PAGE field survives -> "3" / "iii"
    // The paragraph and its runs stay balanced (no dangling field runs).
    expect(count(after, /<w:p\b/g)).toBe(count(after, /<\/w:p>/g));
    expect(count(after, /<w:r\b/g)).toBe(count(after, /<\/w:r>/g));
    // The bottom-left logo drawing is untouched.
    expect(after).toContain('<w:drawing>');
  });

  it('is idempotent and a safe no-op on already-simplified footer XML', () => {
    const once = simplifyFooterPageNumber(footer());
    expect(simplifyFooterPageNumber(once)).toBe(once);
    expect(simplifyFooterPageNumber('<w:ftr><w:p/></w:ftr>')).toBe('<w:ftr><w:p/></w:ftr>');
  });
});

describe('removeExtraBlankParagraphs', () => {
  const doc = () => zipOf().file('word/document.xml')!.asText();

  it('removes the two stray blank paragraphs (conclusion + structure chart)', () => {
    const before = doc();
    expect(before).toContain('w14:paraId="6284A575"');
    expect(before).toContain('w14:paraId="11AAEE03"');

    const after = removeExtraBlankParagraphs(before);
    expect(after).not.toContain('w14:paraId="6284A575"');
    expect(after).not.toContain('w14:paraId="11AAEE03"');
    // Exactly two paragraphs removed; everything else preserved and balanced.
    expect(count(after, /<w:p\b/g)).toBe(count(before, /<w:p\b/g) - 2);
    expect(count(after, /<w:p\b/g)).toBe(count(after, /<\/w:p>/g));
    // Neighbouring real content is still there.
    expect(after).toContain('{{%structureChart}}');
    expect(after).toContain('Corporate structure overview');
  });

  it('only matches empty paragraphs, leaving a same-id paragraph with content intact', () => {
    const withContent = '<w:p w14:paraId="6284A575"><w:pPr><w:widowControl/></w:pPr><w:r><w:t>keep</w:t></w:r></w:p>';
    expect(removeExtraBlankParagraphs(withContent)).toBe(withContent);
  });
});

describe('preprocessMemoTemplate', () => {
  it('applies both fixes to a loaded template zip in place', () => {
    const zip = zipOf();
    preprocessMemoTemplate(zip);
    const footer = zip.file('word/footer1.xml')!.asText();
    const document = zip.file('word/document.xml')!.asText();
    expect(footer).not.toContain('SECTIONPAGES');
    expect(document).not.toContain('w14:paraId="6284A575"');
    expect(document).not.toContain('w14:paraId="11AAEE03"');
  });
});
