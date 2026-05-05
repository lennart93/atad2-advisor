import { useEffect, useRef, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { usePrefillJob, useAllPrefills } from "@/hooks/usePrefill";

const WAIT_TIMEOUT_MS = 120_000;

interface Props {
  sessionId: string;
  onContinue: () => void;
}

export function AnalyzeProgress({ sessionId, onContinue }: Props) {
  const { data: job } = usePrefillJob(sessionId);
  const { data: prefills } = useAllPrefills(sessionId);

  const [pct, setPct] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const startedAtRef = useRef<number>(Date.now());

  // "Ready" the moment the first prefill lands. The swarm keeps running on
  // the server side; remaining suggestions arrive via Realtime as the user
  // works through the questionnaire.
  const hasFirstPrefill = (prefills?.length ?? 0) > 0;
  const failed = job?.status === "failed";
  const ready = hasFirstPrefill;

  useEffect(() => {
    if (ready) {
      setPct(100);
    }
  }, [ready]);

  useEffect(() => {
    if (ready) return;
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
  }, [ready]);

  const canContinue = ready || timedOut || failed;
  const buttonLabel = ready ? "Start questions" : "Start questions anyway";

  return (
    <div className="space-y-4">
      <Progress value={pct} className="h-2" />
      <div className="flex items-center justify-end text-xs text-muted-foreground">
        <span>{Math.round(pct)}%</span>
      </div>
      {(timedOut || failed) && !ready && (
        <p className="text-sm text-muted-foreground">
          {failed
            ? "We couldn't process the documents this time. You can start the questions now; suggestions may still appear inline if the analysis recovers in the background."
            : "Looks like we couldn't fully process the documents in time. You can start the questions now; suggestions will still appear inline as we finish."}
        </p>
      )}
      {canContinue && (
        <div className="pt-2">
          <Button onClick={onContinue} size="lg" className="w-full sm:w-auto">
            {buttonLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
