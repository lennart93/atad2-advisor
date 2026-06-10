import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { useOpenQuestionsView } from "@/hooks/useOpenQuestions";

export interface OpenQuestionsStreamProps {
  sessionId: string;
}

/**
 * Compact read-only live list for the analysis phase, mounted under the
 * AnalyzeProgress card. New register rows appear within seconds: the DB
 * trigger writes the register in the same transaction as each swarm prefill
 * upsert and the table is in the realtime publication. No actions here;
 * the advisor acts on rows from the panel or sheet after analysis.
 */
export function OpenQuestionsStream({ sessionId }: OpenQuestionsStreamProps) {
  const { rows, resolveText } = useOpenQuestionsView(sessionId);

  const streamRows = useMemo(
    () =>
      rows
        .filter((r) => r.status === "open" || r.status === "taken_to_client")
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
        ),
    [rows],
  );

  // Quiet until the swarm flags its first open question.
  if (streamRows.length === 0) return null;

  return (
    <Card className="p-5">
      <p className="text-sm font-medium tracking-tight">
        Open questions so far ({streamRows.length})
      </p>
      <ul className="mt-3 max-h-64 space-y-1.5 overflow-y-auto">
        {streamRows.map((row) => (
          <li
            key={row.id}
            className="animate-in fade-in slide-in-from-bottom-1 text-sm leading-snug text-foreground"
          >
            {resolveText(row)}{" "}
            <span className="whitespace-nowrap text-xs text-muted-foreground">
              Needs a client answer
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
