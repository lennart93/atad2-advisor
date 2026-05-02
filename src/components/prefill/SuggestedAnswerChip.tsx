import { Button } from "@/components/ui/button";

interface Props {
  suggestedAnswer: "yes" | "no" | "unknown" | null;
  confidencePct: number | null;
  answerRationale: string | null;
  onUse: (answer: "yes" | "no" | "unknown") => void;
}

const CONFIDENCE_THRESHOLD = 40;

export function SuggestedAnswerChip({ suggestedAnswer, confidencePct, answerRationale, onUse }: Props) {
  if (!suggestedAnswer || confidencePct == null || confidencePct < CONFIDENCE_THRESHOLD) {
    return null;
  }

  const tier = confidencePct >= 70 ? "high" : "medium";
  const borderClass = tier === "high"
    ? "border-l-green-500 bg-green-50/40"
    : "border-l-amber-500 bg-amber-50/40";
  const tierLabel = tier === "medium" ? " — verify" : "";
  const answerLabel = suggestedAnswer.charAt(0).toUpperCase() + suggestedAnswer.slice(1);

  return (
    <div className={`border border-border border-l-4 ${borderClass} rounded p-3 mb-2`}>
      <div className="flex items-start gap-3">
        <div className="flex-1 text-sm">
          <div className="font-medium">
            Suggested answer: {answerLabel} ({confidencePct}%){tierLabel}
          </div>
          {answerRationale && (
            <div className="text-xs text-muted-foreground mt-1">{answerRationale}</div>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => onUse(suggestedAnswer)}>
          Use
        </Button>
      </div>
    </div>
  );
}
