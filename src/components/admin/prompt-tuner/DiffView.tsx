import { useMemo } from "react";
import { computeBoundedDiff } from "@/lib/admin/boundedDiff";

/**
 * Word-level diff of original vs improved. Monochrome: additions italic ink,
 * deletions struck through in the faint ink-tertiary tone. Same idiom as
 * QuestionEditorPanel's inline diff. The diff is time-bounded and memoized;
 * when the texts are too far apart to diff in budget, both are shown plainly.
 */
export function DiffView({ original, improved }: { original: string; improved: string }) {
  const parts = useMemo(() => computeBoundedDiff(original, improved), [original, improved]);

  if (!parts) {
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          These texts differ too much to highlight change by change. Both versions are shown in full instead.
        </p>
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-normal mb-1.5">
            Original
          </div>
          <pre className="bg-muted/40 border border-border p-3 rounded-md text-xs whitespace-pre-wrap max-h-72 overflow-auto leading-relaxed text-muted-foreground">
            {original}
          </pre>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-normal mb-1.5">
            Improved
          </div>
          <pre className="bg-muted/40 border border-border p-3 rounded-md text-xs whitespace-pre-wrap max-h-72 overflow-auto leading-relaxed text-foreground">
            {improved}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <pre className="bg-muted/40 border border-border p-3 rounded-md text-xs whitespace-pre-wrap max-h-96 overflow-auto leading-relaxed">
      {parts.map((p, i) => {
        if (p.added) {
          return (
            <span key={i} className="text-ds-ink italic rounded px-0.5">
              {p.value}
            </span>
          );
        }
        if (p.removed) {
          return (
            <span key={i} className="text-ds-ink-tertiary line-through rounded px-0.5">
              {p.value}
            </span>
          );
        }
        return (
          <span key={i} className="text-muted-foreground">
            {p.value}
          </span>
        );
      })}
    </pre>
  );
}
