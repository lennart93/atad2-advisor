// Client-side fixes applied to the memo .docx template at generation time, so
// they ship with the frontend and need no re-upload of the Storage template.
//
// Each function is a pure string transform on one template part, and every one is
// idempotent and a safe no-op when its anchor is absent (so a later re-authoring
// of the template can only lose the fix, never corrupt the document). The zip
// wrapper preprocessMemoTemplate applies them; DownloadMemoButton calls it once,
// right after loading the template and before docxtemplater renders.

import type PizZip from 'pizzip';

/**
 * Footer: keep the PAGE field, drop the " | SECTIONPAGES" total.
 *
 * The body and the appendix share this footer. PAGE auto-formats per section
 * (decimal in the body, lower-roman in the appendix), so each section shows a
 * clean page number on its own. SECTIONPAGES does NOT follow the section's
 * number format, which is why the appendix used to read "iii | 12" (a roman page
 * next to an arabic whole-document count). Removing the total gives "3" in the
 * body and "iii" in the appendix.
 *
 * Anchored on the PAGE field's own instruction text (`<w:instrText>PAGE`, which
 * SECTIONPAGES does not match because its instrText starts with a space): keep
 * everything up to the PAGE field's end run, then drop the rest of the paragraph
 * up to </w:p> (the separator run and the whole SECTIONPAGES field).
 */
export function simplifyFooterPageNumber(footerXml: string): string {
  const re =
    /(<w:instrText[^>]*>PAGE(?:(?!<\/w:p>)[\s\S])*?<w:fldChar w:fldCharType="end"\/><\/w:r>)(?:(?!<\/w:p>)[\s\S])*?(<\/w:p>)/;
  return footerXml.replace(re, '$1$2');
}

/**
 * Remove one empty paragraph identified by its w14:paraId. Matches only when the
 * paragraph is genuinely empty (a pPr and nothing else), so if content is ever
 * added there it is left untouched.
 */
function removeEmptyParaById(documentXml: string, paraId: string): string {
  const re = new RegExp(
    `<w:p\\b[^>]*w14:paraId="${paraId}"[^>]*>\\s*<w:pPr>(?:(?!</w:p>)[\\s\\S])*?</w:pPr>\\s*</w:p>`,
  );
  return documentXml.replace(re, '');
}

// The two stray blank paragraphs in the memo body, by paraId:
//  - 6284A575: between the conclusion intro ("... We require:") and the bullets.
//  - 11AAEE03: below the structure-chart image, before the next heading.
const BLANK_PARA_IDS = ['6284A575', '11AAEE03'];

/** Drop the two extra blank lines (conclusion bullets + structure chart). */
export function removeExtraBlankParagraphs(documentXml: string): string {
  return BLANK_PARA_IDS.reduce(removeEmptyParaById, documentXml);
}

/** Apply every template fix to a loaded memo .docx zip, in place. */
export function preprocessMemoTemplate(zip: PizZip): void {
  const footer = zip.file('word/footer1.xml');
  if (footer) zip.file('word/footer1.xml', simplifyFooterPageNumber(footer.asText()));

  const doc = zip.file('word/document.xml');
  if (doc) zip.file('word/document.xml', removeExtraBlankParagraphs(doc.asText()));
}
