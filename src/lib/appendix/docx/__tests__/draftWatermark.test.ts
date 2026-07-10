import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import PizZip from 'pizzip';
import {
  WATERMARK_SHAPE_ID,
  injectWatermarkIntoHeader,
  buildWatermarkHeaderXml,
  addDefaultHeaderRefs,
  applyDraftWatermark,
} from '@/lib/appendix/docx/draftWatermark';
import { buildMemoAppendicesXml } from '@/lib/appendix/docx/memoAppendices';

const TEMPLATE = resolve(process.cwd(), 'templates/memo_atad2_with_structure_placeholder.docx');
const zipOf = () => new PizZip(readFileSync(TEMPLATE));
const count = (s: string, re: RegExp) => (s.match(re) ?? []).length;

// The rendered document carries its section properties via {{@appendicesXml}};
// the template itself has none. Mimic a rendered document.xml by appending the
// generated body-only tail (first-page header ref, no default header ref).
function renderedDocumentXml(zip: PizZip): string {
  const tail = buildMemoAppendicesXml(null, []);
  return zip.file('word/document.xml')!.asText().replace('</w:body>', `${tail}</w:body>`);
}

describe('injectWatermarkIntoHeader', () => {
  const header = () => zipOf().file('word/header1.xml')!.asText();

  it('adds the watermark shape inside an existing paragraph, keeping the XML balanced', () => {
    const before = header();
    expect(before).not.toContain(WATERMARK_SHAPE_ID);

    const after = injectWatermarkIntoHeader(before);
    expect(after).toContain(WATERMARK_SHAPE_ID);
    expect(after).toContain('string="DRAFT"');
    // No new paragraph: the run rides along in the header's first paragraph.
    expect(count(after, /<w:p\b/g)).toBe(count(before, /<w:p\b/g));
    expect(count(after, /<w:p\b/g)).toBe(count(after, /<\/w:p>/g));
    expect(count(after, /<w:r\b/g)).toBe(count(after, /<\/w:r>/g));
  });

  it('is idempotent', () => {
    const once = injectWatermarkIntoHeader(header());
    expect(injectWatermarkIntoHeader(once)).toBe(once);
  });

  it('gives a paragraph-less header a paragraph of its own', () => {
    const bare = '<w:hdr xmlns:w="urn:x"></w:hdr>';
    const after = injectWatermarkIntoHeader(bare);
    expect(after).toContain(WATERMARK_SHAPE_ID);
    expect(count(after, /<w:p\b/g)).toBe(1);
  });

  it('skips the shapetype when the part already defines it', () => {
    const withType = '<w:hdr><w:p><w:r><w:pict><v:shapetype id="_x0000_t136"/></w:pict></w:r></w:p></w:hdr>';
    const after = injectWatermarkIntoHeader(withType);
    expect(count(after, /id="_x0000_t136"/g)).toBe(1);
    expect(after).toContain(WATERMARK_SHAPE_ID);
  });
});

describe('buildWatermarkHeaderXml', () => {
  it('is a self-contained header part with the shapetype and the shape', () => {
    const xml = buildWatermarkHeaderXml();
    expect(xml).toContain('<w:hdr');
    expect(xml).toContain('id="_x0000_t136"');
    expect(xml).toContain(WATERMARK_SHAPE_ID);
    expect(xml).toContain('string="DRAFT"');
  });
});

describe('addDefaultHeaderRefs', () => {
  it('adds a default header reference to every section lacking one', () => {
    const doc = renderedDocumentXml(zipOf());
    // The generated body section only references the first-page header.
    expect(doc).toContain('<w:headerReference w:type="first"');
    expect(doc).not.toContain('w:type="default" r:id="rIdDraftWatermark"');

    const after = addDefaultHeaderRefs(doc);
    expect(count(after, /<w:headerReference w:type="default" r:id="rIdDraftWatermark"\/>/g)).toBe(
      count(after, /<w:sectPr\b/g),
    );
    // The existing first-page header reference is untouched.
    expect(after).toContain('<w:headerReference w:type="first"');
  });

  it('covers the appendix section too and is idempotent', () => {
    const facts = { entities: [], relationships: [], transactions: [] } as any;
    const tail = buildMemoAppendicesXml(facts, [
      { id: 'x', decision: 'Not triggered', reasoning: 'r', reference: '' } as any,
    ]);
    // Only assert when the tail actually contains two sections; with no
    // renderable appendix content it stays a single body section.
    const sections = count(tail, /<w:sectPr\b/g);
    const after = addDefaultHeaderRefs(tail);
    expect(count(after, /w:type="default" r:id="rIdDraftWatermark"/g)).toBe(sections);
    expect(addDefaultHeaderRefs(after)).toBe(after);
  });

  it('leaves a section that already has a default header alone', () => {
    const doc = '<w:sectPr><w:headerReference w:type="default" r:id="rId9"/><w:pgSz/></w:sectPr>';
    expect(addDefaultHeaderRefs(doc)).toBe(doc);
  });
});

describe('applyDraftWatermark', () => {
  it('wires the watermark into headers, part, content types, rels and sections', () => {
    const zip = zipOf();
    zip.file('word/document.xml', renderedDocumentXml(zip));

    applyDraftWatermark(zip);

    expect(zip.file('word/header1.xml')!.asText()).toContain(WATERMARK_SHAPE_ID);
    expect(zip.file('word/headerDraftWatermark.xml')!.asText()).toContain(WATERMARK_SHAPE_ID);
    expect(zip.file('[Content_Types].xml')!.asText()).toContain(
      'PartName="/word/headerDraftWatermark.xml"',
    );
    expect(zip.file('word/_rels/document.xml.rels')!.asText()).toContain(
      'Id="rIdDraftWatermark"',
    );
    const doc = zip.file('word/document.xml')!.asText();
    expect(count(doc, /w:type="default" r:id="rIdDraftWatermark"/g)).toBe(
      count(doc, /<w:sectPr\b/g),
    );
  });

  it('is idempotent across a second application', () => {
    const zip = zipOf();
    zip.file('word/document.xml', renderedDocumentXml(zip));
    applyDraftWatermark(zip);
    const snapshot = {
      header: zip.file('word/header1.xml')!.asText(),
      wm: zip.file('word/headerDraftWatermark.xml')!.asText(),
      types: zip.file('[Content_Types].xml')!.asText(),
      rels: zip.file('word/_rels/document.xml.rels')!.asText(),
      doc: zip.file('word/document.xml')!.asText(),
    };
    applyDraftWatermark(zip);
    expect(zip.file('word/header1.xml')!.asText()).toBe(snapshot.header);
    expect(zip.file('word/headerDraftWatermark.xml')!.asText()).toBe(snapshot.wm);
    expect(zip.file('[Content_Types].xml')!.asText()).toBe(snapshot.types);
    expect(zip.file('word/_rels/document.xml.rels')!.asText()).toBe(snapshot.rels);
    expect(zip.file('word/document.xml')!.asText()).toBe(snapshot.doc);
  });
});
