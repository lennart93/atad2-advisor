import { diffWordsWithSpace, type Change } from "diff";

/**
 * Word-level diff of original vs improved. Monochrome: additions italic ink,
 * deletions struck through in the faint ink-tertiary tone. Same idiom as
 * QuestionEditorPanel's inline diff.
 */
export function DiffView({ original, improved }: { original: string; improved: string }) {
  const parts: Change[] = diffWordsWithSpace(original, improved);
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
