import { dedupeEntityNames, parseTaxpayerNames, taxpayerSubjectLabel } from "@/lib/taxpayer";
import { cn } from "@/lib/utils";

interface Props {
  /** The stored taxpayer_name value (newline-joined for a multi-entity subject). */
  stored: string | null | undefined;
  /**
   * 'count'  - lead entity name (truncates) plus a non-truncating "+N" count.
   *            For dense rows like the dashboard ledger, so multi-entity
   *            assessments stay distinguishable instead of collapsing into an
   *            identical comma-run that clips.
   * 'others' - "lead entity and N others", flows inside a sentence.
   */
  form?: "count" | "others";
  /** Styling for the lead name (inherits size from the parent by default). */
  className?: string;
  /** Styling for the "+N" count (compact form only). */
  moreClassName?: string;
}

/**
 * One assessment can name several entities assessed together as the subject.
 * Rather than joining every name with commas (a wall of text that clips to an
 * illegible, indistinguishable run), show the lead entity plus a count of the
 * rest. A single-entity subject renders just the name.
 */
export function TaxpayerSubject({ stored, form = "count", className, moreClassName }: Props) {
  // Deduped so the count agrees with every roster surface (report, dossier card).
  const names = dedupeEntityNames(parseTaxpayerNames(stored));
  const lead = names[0] ?? "";
  const extra = names.length - 1;

  if (form === "others") {
    return <span className={className}>{taxpayerSubjectLabel(stored)}</span>;
  }

  return (
    <span className="flex min-w-0 items-baseline gap-2">
      <span className={cn("min-w-0 truncate", className)}>{lead}</span>
      {extra > 0 && (
        <span className={cn("shrink-0 tabular-nums text-ds-ink-secondary", moreClassName)}>+{extra}</span>
      )}
    </span>
  );
}
