import { useEffect, useRef, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { usePrefillJob, useAllPrefills } from "@/hooks/usePrefill";
import { useQuestionCount } from "@/hooks/useQuestionCount";

const WAIT_TIMEOUT_MS = 120_000;

interface Props {
  sessionId: string;
  onComplete: () => void;
  onSkip: () => void;
}

export function AnalyzeProgress({ sessionId, onComplete, onSkip }: Props) {
  const { data: job } = usePrefillJob(sessionId);
  const { data: prefills } = useAllPrefills(sessionId);
  const { data: questionCount } = useQuestionCount();

  const [pct, setPct] = useState(0);
  const startedAtRef = useRef<number>(Date.now());

  useEffect(() => {
    if (job?.status === "completed") {
      setPct(100);
      const t = setTimeout(onComplete, 250);
      return () => clearTimeout(t);
    }
  }, [job?.status, onComplete]);

  useEffect(() => {
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      const fraction = Math.min(1, elapsed / WAIT_TIMEOUT_MS);
      // Logistic-ish curve: faster early, slower near end. Caps at ~95% so the
      // "snap to 100" on completion feels meaningful.
      const eased = 1 - Math.pow(1 - fraction, 1.6);
      setPct(Math.min(95, eased * 95));
      if (elapsed >= WAIT_TIMEOUT_MS) {
        window.clearInterval(tick);
        onSkip();
      }
    }, 500);
    return () => window.clearInterval(tick);
  }, [onSkip]);

  const ready = (prefills ?? []).length;
  const total = questionCount ?? 0;

  return (
    <div className="space-y-3">
      <Progress value={pct} />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {job?.status === "completed"
            ? "Analysis complete"
            : total > 0
              ? `${ready} / ${total} questions ready`
              : "Starting analysis…"}
        </span>
        <span>{Math.round(pct)}%</span>
      </div>
      <button
        type="button"
        onClick={onSkip}
        className="text-xs text-muted-foreground underline hover:text-foreground"
      >
        Continue to questions now
      </button>
    </div>
  );
}
