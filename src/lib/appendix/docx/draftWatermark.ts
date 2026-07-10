// A diagonal DRAFT watermark applied client-side to the rendered memo .docx.
// It is the same VML text-path shape Word inserts via Design > Watermark, and
// it repeats on every page because it lives in the page headers.
//
// The memo template only has a first-page header (rId12, the cover header);
// every other page uses Word's implicit empty default header. So the watermark
// goes in two places: (a) into every existing header part, and (b) into a new
// header part that is wired up as the default header of each section that has
// none (the memo body and the appendix section both lack one).
//
// Must run AFTER docxtemplater renders: the section properties arrive through
// the {{@appendicesXml}} placeholder, so before render document.xml has no
// <w:sectPr> to hang the header reference on. Every transform below is
// idempotent and a safe no-op when its anchor is absent.

import type PizZip from 'pizzip';

/**
 * VML shape id of the watermark, doubling as the idempotency marker. Word's
 * Design > Watermark > Remove Watermark only deletes shapes whose id starts
 * with "PowerPlusWaterMarkObject" (its own prefix for text watermarks), so the
 * id MUST keep that prefix or the advisor cannot remove the stamp in Word.
 */
export const WATERMARK_SHAPE_ID = 'PowerPlusWaterMarkObject93502007';

// The template's own relationships are rId1..rId15 and the generated section
// properties hardcode rId11/12/13, so a named id can never collide.
const WATERMARK_REL_ID = 'rIdDraftWatermark';
const WATERMARK_HEADER_PART = 'word/headerDraftWatermark.xml';
const HEADER_CONTENT_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml';
const HEADER_REL_TYPE =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/header';

// Word's text-path shapetype (preset 136). Only needed once per header part;
// a part that already defines it (id="_x0000_t136") keeps its own copy.
const TEXTPATH_SHAPETYPE =
  '<v:shapetype id="_x0000_t136" coordsize="21600,21600" o:spt="136" adj="10800" path="m@7,l@8,m@5,21600l@6,21600e">' +
  '<v:formulas>' +
  '<v:f eqn="sum #0 0 10800"/><v:f eqn="prod #0 2 1"/><v:f eqn="sum 21600 0 @1"/>' +
  '<v:f eqn="sum 0 0 @2"/><v:f eqn="sum 21600 0 @3"/><v:f eqn="if @0 @3 0"/>' +
  '<v:f eqn="if @0 21600 @1"/><v:f eqn="if @0 0 @2"/><v:f eqn="if @0 @4 21600"/>' +
  '<v:f eqn="mid @5 @6"/><v:f eqn="mid @8 @5"/><v:f eqn="mid @7 @8"/>' +
  '<v:f eqn="mid @6 @7"/><v:f eqn="sum @6 0 @5"/>' +
  '</v:formulas>' +
  '<v:path textpathok="t" o:connecttype="custom" o:connectlocs="@9,0;@10,10800;@11,21600;@12,10800" o:connectangles="270,180,90,0"/>' +
  '<v:textpath on="t" fitshape="t"/>' +
  '<v:handles><v:h position="#0,bottomRight" xrange="6629,14971"/></v:handles>' +
  '<o:lock v:ext="edit" text="t" shapetype="t"/>' +
  '</v:shapetype>';

// The watermark itself: rotated silver "DRAFT" at 50% opacity, centered on the
// page, behind the text (negative z-index). The VML (v:) and Office (o:)
// namespaces are declared on the <w:pict> so the fragment is valid in any
// header part. fitshape stretches the text to fill the shape box exactly, so
// the box keeps the natural aspect ratio of "DRAFT" (about 4.6:1) to avoid
// visibly elongated letters; a bit smaller than Word's stock 527.85pt so it
// does not dominate the page.
function watermarkShape(): string {
  return (
    `<v:shape id="${WATERMARK_SHAPE_ID}" o:spid="_x0000_s2049" type="#_x0000_t136" ` +
    'style="position:absolute;margin-left:0;margin-top:0;width:460pt;height:100pt;' +
    'rotation:315;z-index:-251654144;mso-position-horizontal:center;' +
    'mso-position-horizontal-relative:margin;mso-position-vertical:center;' +
    'mso-position-vertical-relative:margin" o:allowincell="f" fillcolor="silver" stroked="f">' +
    '<v:fill opacity=".5"/>' +
    '<v:textpath style="font-family:&quot;Calibri&quot;;font-size:1pt" string="DRAFT"/>' +
    '</v:shape>'
  );
}

function watermarkPict(includeShapetype: boolean): string {
  return (
    '<w:pict xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">' +
    (includeShapetype ? TEXTPATH_SHAPETYPE : '') +
    watermarkShape() +
    '</w:pict>'
  );
}

/**
 * Put the watermark run into one existing header part. The shape is absolutely
 * positioned, so it rides along inside the header's first paragraph instead of
 * adding a new (visible) empty line to the header.
 */
export function injectWatermarkIntoHeader(headerXml: string): string {
  if (headerXml.includes(WATERMARK_SHAPE_ID)) return headerXml;
  const run = `<w:r>${watermarkPict(!headerXml.includes('id="_x0000_t136"'))}</w:r>`;
  const paraEnd = headerXml.indexOf('</w:p>');
  if (paraEnd !== -1) {
    return headerXml.slice(0, paraEnd) + run + headerXml.slice(paraEnd);
  }
  // Header without any paragraph: give the run a paragraph of its own.
  return headerXml.replace('</w:hdr>', `<w:p>${run}</w:p></w:hdr>`);
}

/** The standalone default-header part: nothing but the watermark. */
export function buildWatermarkHeaderXml(): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:p><w:r>${watermarkPict(true)}</w:r></w:p>` +
    '</w:hdr>'
  );
}

/**
 * Give every section that has no default header a reference to the watermark
 * header. Header/footer references come first in a <w:sectPr>, so the new one
 * is inserted right after the opening tag; sections that already carry a
 * default header (including ours, on a second pass) are left untouched.
 */
export function addDefaultHeaderRefs(documentXml: string, relId: string = WATERMARK_REL_ID): string {
  return documentXml.replace(
    /<w:sectPr(\s[^>]*)?>((?:(?!<\/w:sectPr>)[\s\S])*?)<\/w:sectPr>/g,
    (match, attrs: string | undefined, inner: string) => {
      if (/<w:headerReference [^>]*w:type="default"/.test(inner)) return match;
      return `<w:sectPr${attrs ?? ''}><w:headerReference w:type="default" r:id="${relId}"/>${inner}</w:sectPr>`;
    },
  );
}

/**
 * Stamp the DRAFT watermark on every page of a rendered memo .docx, in place.
 * Call after doc.render(): the section properties only exist from then on.
 */
export function applyDraftWatermark(zip: PizZip): void {
  // (a) Existing headers (the cover header on page 1).
  for (const name of Object.keys(zip.files)) {
    if (/^word\/header[^/]*\.xml$/.test(name) && name !== WATERMARK_HEADER_PART) {
      zip.file(name, injectWatermarkIntoHeader(zip.file(name)!.asText()));
    }
  }

  // (b) The watermark-only header part for every page without its own header.
  zip.file(WATERMARK_HEADER_PART, buildWatermarkHeaderXml());

  const contentTypes = zip.file('[Content_Types].xml');
  if (contentTypes) {
    const xml = contentTypes.asText();
    if (!xml.includes(`/${WATERMARK_HEADER_PART}`)) {
      zip.file(
        '[Content_Types].xml',
        xml.replace(
          '</Types>',
          `<Override PartName="/${WATERMARK_HEADER_PART}" ContentType="${HEADER_CONTENT_TYPE}"/></Types>`,
        ),
      );
    }
  }

  const rels = zip.file('word/_rels/document.xml.rels');
  if (rels) {
    const xml = rels.asText();
    if (!xml.includes(`Id="${WATERMARK_REL_ID}"`)) {
      zip.file(
        'word/_rels/document.xml.rels',
        xml.replace(
          '</Relationships>',
          `<Relationship Id="${WATERMARK_REL_ID}" Type="${HEADER_REL_TYPE}" Target="headerDraftWatermark.xml"/></Relationships>`,
        ),
      );
    }
  }

  const doc = zip.file('word/document.xml');
  if (doc) zip.file('word/document.xml', addDefaultHeaderRefs(doc.asText()));
}
