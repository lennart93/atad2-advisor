#!/usr/bin/env node
/*
 * Patch the memo .docx template for the appendix + section-numbering feature.
 *
 * The memo body is rendered client-side with docxtemplater. The appendices AND the
 * document's final section properties are emitted in TypeScript
 * (src/lib/appendix/docx/memoAppendices.ts) and injected through a single raw-XML
 * placeholder, {{@appendicesXml}}, which must be the last paragraph in the body.
 * Because the appendices live in their own (lower-roman) section after a section
 * break, the template carries NO static <w:sectPr> of its own — the injected XML
 * supplies it. This script therefore:
 *   1. ensures the {{@appendicesXml}} placeholder is the last body paragraph,
 *   2. removes the static body <w:sectPr> (the generator emits the real one),
 *   3. removes the stray "Divider" rule paragraph under the closing disclaimer,
 *   4. switches the footer total from NUMPAGES to SECTIONPAGES (per-section count).
 *
 * Idempotent. Reads the live template from Supabase Storage (anon read) and writes
 * the patched copy into the repo at templates/. Upload it to Storage with
 * scripts/upload-memo-template.cjs.
 *
 *   node scripts/patch-memo-template.cjs
 */
const fs = require('fs');
const path = require('path');
const https = require('https');
const PizZip = require('pizzip');

const STORAGE_BASE = 'https://api.atad2.tax/storage/v1';
const ANON =
  'eyJhbGciOiAiSFMyNTYiLCAidHlwIjogIkpXVCJ9.eyJyb2xlIjogImFub24iLCAiaXNzIjogInN1cGFiYXNlIiwgImlhdCI6IDE2NDE3NjkyMDAsICJleHAiOiAxNzk5NTM1NjAwfQ.rnsxsFRAvsoKzOta2QUNb7D_nzd4erNRN4WyqBw99UY';
const OBJECT = 'templates/memo_atad2_with_structure_placeholder.docx';
const OUT = path.join(__dirname, '..', 'templates', 'memo_atad2_with_structure_placeholder.docx');
const PLACEHOLDER_P = '<w:p><w:r><w:t>{{@appendicesXml}}</w:t></w:r></w:p>';

function download(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, { headers: { Authorization: `Bearer ${ANON}`, apikey: ANON } }, (res) => {
        if (res.statusCode !== 200) { reject(new Error(`download failed: HTTP ${res.statusCode}`)); res.resume(); return; }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
      })
      .on('error', reject);
  });
}

(async () => {
  const buf = await download(`${STORAGE_BASE}/object/${OBJECT}`);
  const zip = new PizZip(buf);
  let doc = zip.file('word/document.xml').asText();
  const log = [];

  // 1) Ensure the placeholder paragraph exists.
  if (!doc.includes('{{@appendicesXml}}')) {
    // Insert just before the body sectPr if present, else before </w:body>.
    if (/<w:sectPr\b/.test(doc)) doc = doc.replace(/<w:sectPr\b/, `${PLACEHOLDER_P}<w:sectPr`);
    else doc = doc.replace('</w:body>', `${PLACEHOLDER_P}</w:body>`);
    log.push('inserted {{@appendicesXml}} placeholder');
  }

  // 2) Remove the stray "Divider" rule paragraph (the short horizontal line under the
  //    closing disclaimer). Only the LAST Divider paragraph is removed, so any
  //    legitimate divider earlier in the document is left intact.
  const dividerRe = /<w:p\b[^>]*>(?:(?!<\/w:p>).)*?<w:pStyle w:val="Divider"\/>(?:(?!<\/w:p>).)*?<\/w:p>/gs;
  const dividers = [...doc.matchAll(dividerRe)];
  if (dividers.length) {
    const last = dividers[dividers.length - 1];
    doc = doc.slice(0, last.index) + doc.slice(last.index + last[0].length);
    log.push(`removed last Divider rule paragraph (of ${dividers.length})`);
  }

  // 3) Remove the static body-final <w:sectPr> (the generator now emits the real one,
  //    so the body can be split into a decimal body + lower-roman appendix section).
  const beforeSect = doc;
  doc = doc.replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g, '');
  if (doc !== beforeSect) log.push('removed static body sectPr');

  // Placeholder must be the final paragraph; if anything slipped after it, leave as-is
  // (docxtemplater raw injection appends the sectPr after it at render time).
  zip.file('word/document.xml', doc);

  // 4) Footer: NUMPAGES (whole-document) -> SECTIONPAGES (per-section), and drop the
  //    \* Arabic switch so the total follows each section's number format.
  const footer = zip.file('word/footer1.xml');
  if (footer) {
    let ft = footer.asText();
    const before = ft;
    ft = ft.replace(/NUMPAGES\s*\\\*\s*Arabic\s*/g, 'SECTIONPAGES ').replace(/NUMPAGES/g, 'SECTIONPAGES');
    if (ft !== before) { zip.file('word/footer1.xml', ft); log.push('footer NUMPAGES -> SECTIONPAGES'); }
  }

  const out = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
  fs.writeFileSync(OUT, out);
  console.log(log.length ? log.join('\n') : 'already patched (no changes)');
  console.log(`Wrote ${OUT} (${out.length} bytes).`);
})().catch((e) => { console.error(e.message || e); process.exit(1); });
