// PowerPoint (.pptx) -> plain-text extractor for LLM prefill.
//
// .pptx is a zip of slide XML parts; each slide's visible text lives in <a:t>
// runs grouped into <a:p> paragraphs. We pull that text out in slide order and
// upload it as text/plain, the same way DOCX/XLSX/RTF are handled, so the deck
// flows through the text pipeline. Done in the browser; uses pizzip, which is
// already a dependency (docxtemplater), dynamically imported so it stays out of
// the main bundle.

function safeCodePoint(cp: number): string {
  return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : "";
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => safeCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeCodePoint(Number(d)))
    .replace(/&amp;/g, "&"); // last, so a literal "&amp;amp;" is not double-decoded
}

/**
 * Extract readable text from one slide's XML: the <a:t> runs within each <a:p>
 * paragraph are joined, and paragraphs are separated by newlines.
 */
export function pptxSlideToText(slideXml: string): string {
  const paras: string[] = [];
  const pRe = /<a:p\b[\s\S]*?<\/a:p>/g;
  let pm: RegExpExecArray | null;
  while ((pm = pRe.exec(slideXml)) !== null) {
    const runs: string[] = [];
    const tRe = /<a:t>([\s\S]*?)<\/a:t>/g;
    let tm: RegExpExecArray | null;
    while ((tm = tRe.exec(pm[0])) !== null) runs.push(decodeXmlEntities(tm[1]));
    const line = runs.join("").trim();
    if (line) paras.push(line);
  }
  return paras.join("\n");
}

function slideNumber(path: string): number {
  const m = path.match(/slide(\d+)\.xml$/);
  return m ? Number(m[1]) : 0;
}

/**
 * Convert a .pptx ArrayBuffer into plain text, one block per slide (in slide
 * order). Returns the empty string if the deck has no readable text.
 */
export async function pptxToText(buffer: ArrayBuffer): Promise<string> {
  const PizZip = (await import("pizzip")).default;
  const zip = new PizZip(buffer);
  const slidePaths = Object.keys(zip.files)
    .filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const parts: string[] = [];
  for (const path of slidePaths) {
    const xml = zip.files[path].asText();
    const text = pptxSlideToText(xml);
    if (text) parts.push(text);
  }
  return parts.join("\n\n").trim();
}
