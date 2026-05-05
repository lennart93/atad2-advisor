import { useEffect, useRef, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { usePrefillJob, useAllPrefills } from "@/hooks/usePrefill";
import { useQuestionCount } from "@/hooks/useQuestionCount";

const WAIT_TIMEOUT_MS = 120_000;

interface Props {
  sessionId: string;
  onContinue: () => void;
}

export function AnalyzeProgress({ sessionId, onContinue }: Props) {
  const { data: job } = usePrefillJob(sessionId);
  const { data: prefills } = useAllPrefills(sessionId);
  const { data: questionCount } = useQuestionCount();

  const [pct, setPct] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const startedAtRef = useRef<number>(Date.now());

  const completed = job?.status === "completed";

  useEffect(() => {
    if (completed) {
      setPct(100);
    }
  }, [completed]);

  useEffect(() => {
    if (completed) return;
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      const fraction = Math.min(1, elapsed / WAIT_TIMEOUT_MS);
      const eased = 1 - Math.pow(1 - fraction, 1.6);
      setPct(Math.min(95, eased * 95));
      if (elapsed >= WAIT_TIMEOUT_MS) {
        window.clearInterval(tick);
        setTimedOut(true);
      }
    }, 500);
    return () => window.clearInterval(tick);
  }, [completed]);

  const ready = (prefills ?? []).length;
  const total = questionCount ?? 0;

  const canContinue = completed || timedOut;
  const buttonLabel = completed ? "Start questions" : "Start questions anyway";

  return (
    <div className="space-y-3">
      <Progress value={pct} />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>
          {completed
            ? "Analysis complete"
            : total > 0
              ? `${ready} / ${total} questions ready`
              : "Starting analysis…"}
        </span>
        <span>{Math.round(pct)}%</span>
      </div>
      {timedOut && !completed && (
        <p className="text-sm text-muted-foreground">
          Looks like we couldn't fully process the documents in time. You can start
          the questions now — suggestions will still appear inline as we finish.
        </p>
      )}
      {canContinue && (
        <div className="pt-2">
          <Button onClick={onContinue}>{buttonLabel}</Button>
        </div>
      )}
    </div>
  );
}
