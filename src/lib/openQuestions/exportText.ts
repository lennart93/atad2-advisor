import type { OpenQuestionGroups } from "./grouping";
import type { OpenQuestionRow } from "./types";

export interface OpenQuestionExportItem {
  question: string;
  whyItMatters: string | null;
}

export interface OpenQuestionExportMeta {
  taxpayerName: string;
  fiscalYear: string;
  dateLong: string;
}

/**
 * Plain-text numbered list for "Copy as text". Header, blank line, then one
 * numbered block per item with an indented why-it-matters line when present.
 * Items are separated by one blank line; output ends with a single newline.
 */
export function formatOpenQuestionsText(
  items: OpenQuestionExportItem[],
  meta: OpenQuestionExportMeta,
): string {
  const lines: string[] = [
    `Open questions for ${meta.taxpayerName} (FY ${meta.fiscalYear})`,
    `Recorded on ${meta.dateLong}`,
    "",
  ];

  items.forEach((item, index) => {
    if (index > 0) lines.push("");
    lines.push(`${index + 1}. ${item.question}`);
    const why = item.whyItMatters?.trim();
    if (why) lines.push(`   Why it matters: ${why}`);
  });

  return `${lines.join("\n")}\n`;
}

export interface RowsToExportItemsResult {
  items: OpenQuestionExportItem[];
  /** Ids of included rows with status 'open': the set to flip to taken_to_client. */
  flipRowIds: string[];
}

/**
 * Selects the rows to export, in group order: needsAttention, then active,
 * then later when includeLater is set. Only open/taken_to_client rows are
 * exported; flipRowIds holds the ids that are still 'open' so the caller can
 * stamp them taken_to_client after a successful copy or export.
 */
export function rowsToExportItems(
  groups: OpenQuestionGroups,
  resolveText: (row: OpenQuestionRow) => string,
  includeLater: boolean,
): RowsToExportItemsResult {
  const selected = [
    ...groups.needsAttention,
    ...groups.active,
    ...(includeLater ? groups.later : []),
  ].filter((row) => row.status === "open" || row.status === "taken_to_client");

  return {
    items: selected.map((row) => ({
      question: resolveText(row),
      whyItMatters: row.why_it_matters,
    })),
    flipRowIds: selected
      .filter((row) => row.status === "open")
      .map((row) => row.id),
  };
}

export interface ClientResponseEntry {
  questionId: string;
  question: string;
  clientAnswer: string;
}

/**
 * One plain-text document holding all saved client answers, used by
 * "Re-check with AI" as the upload body. Returns '' when there is nothing
 * to record so callers can skip the upload entirely.
 */
export function buildClientResponsesDocument(
  entries: ClientResponseEntry[],
  dateLong: string,
): string {
  if (entries.length === 0) return "";

  const blocks = entries.map(
    (entry) =>
      `Question ${entry.questionId}: ${entry.question}\n` +
      `Client response: ${entry.clientAnswer}`,
  );

  return `Client responses recorded by the advisor on ${dateLong}\n\n${blocks.join("\n\n")}\n`;
}
