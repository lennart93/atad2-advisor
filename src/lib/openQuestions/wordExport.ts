import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { supabase } from "@/integrations/supabase/client";
import type {
  OpenQuestionExportItem,
  OpenQuestionExportMeta,
} from "./exportText";
import { formatFiscalYears } from "@/utils/formatFiscalYears";

/**
 * Thrown when the Word template is not present in the templates bucket yet.
 * The template is a manual artifact the owner uploads later, so callers
 * soft-fail to "Copy as text" instead of treating this as a hard error.
 */
export class TemplateMissingError extends Error {
  constructor() {
    super("The Word template open_questions_list.docx is not available.");
    this.name = "TemplateMissingError";
  }
}

const TEMPLATE_PATH = "open_questions_list.docx";

/**
 * Renders the open-questions list into the open_questions_list.docx template
 * and triggers a browser download. Follows the DownloadMemoButton pattern
 * (signed URL from the templates bucket, PizZip + Docxtemplater, anchor
 * download) but without the image module: this template has no chart.
 *
 * Expected template tags (the owner authors the docx manually):
 *   {{taxpayer_name}}   taxpayer the questions belong to
 *   {{fiscal_year}}     fiscal year of the assessment
 *   {{today_long}}      export date, e.g. "10 June 2026"
 *   Question loop:
 *     {{#questions}}
 *       {{n}}     1-based number
 *       {{text}}  the question for the client
 *       {{why}}   why it matters (empty string when absent)
 *     {{/questions}}
 *
 * Throws TemplateMissingError when the template cannot be fetched; rethrows
 * Docxtemplater render errors (template syntax problems) as-is so the caller
 * can show a generic failure message.
 */
export async function generateOpenQuestionsDocx({
  items,
  meta,
}: {
  items: OpenQuestionExportItem[];
  meta: OpenQuestionExportMeta;
}): Promise<void> {
  const { data: signedUrlData, error: urlError } = await supabase.storage
    .from("templates")
    .createSignedUrl(TEMPLATE_PATH, 60);
  if (urlError || !signedUrlData?.signedUrl) {
    throw new TemplateMissingError();
  }

  const templateResponse = await fetch(signedUrlData.signedUrl);
  if (!templateResponse.ok) {
    throw new TemplateMissingError();
  }
  const templateArrayBuffer = await templateResponse.arrayBuffer();

  const zip = new PizZip(templateArrayBuffer);
  const doc = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
    nullGetter: () => "",
  });

  doc.render({
    taxpayer_name: meta.taxpayerName,
    fiscal_year: formatFiscalYears(meta.fiscalYear),
    today_long: meta.dateLong,
    questions: items.map((item, index) => ({
      n: index + 1,
      text: item.question,
      why: item.whyItMatters ?? "",
    })),
  });

  const blob = doc.getZip().generate({ type: "blob" });
  const nameSafe = (meta.taxpayerName || "Taxpayer").replace(/[^\w-]+/g, "_");
  const yearSafe = formatFiscalYears(meta.fiscalYear).replace(/[^\w-]+/g, "_");
  const fileName = `ATAD2_Open_Questions_${nameSafe}${yearSafe ? `_${yearSafe}` : ""}.docx`;

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}
