import { useEffect, useRef, useState } from "react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { AssessmentFooterSlot } from "@/components/assessment/AssessmentFooterSlot";
import { usePrefillJob, useAllPrefills } from "@/hooks/usePrefill";
import { useUiBusySignal } from "@/stores/uiBusyStore";
import { ArrowRight } from "lucide-react";

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
  const buttonLabel = !ready && (timedOut || failed) ? "Start questions anyway" : "Start questions";

  // Top-left AppLayout logo spins while we're actively reading documents. The
  // signal turns off as soon as the first suggestion lands (ready) or the job
  // gives up — the card itself stays on screen showing the result state.
  useUiBusySignal(!ready && !failed && !timedOut);

  const statusLabel = failed
    ? "Couldn't process documents"
    : ready
    ? "Suggestions ready"
    : timedOut
    ? "Still working in the background"
    : "Reading your documents…";

  const statusDetail = failed
    ? "You can start the questions now; suggestions may still appear inline if the analysis recovers in the background."
    : ready
    ? "The questionnaire is unlocked. More suggestions will keep arriving as the analysis finishes."
    : timedOut
    ? "We didn't finish in time. You can start the questions now; suggestions will appear inline as we finish."
    : "We're reading your documents and drafting suggested answers.";

  return (
    <>
      <Card className="p-5">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium tracking-tight">{statusLabel}</p>
            <span className="text-xs tabular-nums text-muted-foreground">
              {Math.round(pct)}%
            </span>
          </div>
          <Progress value={pct} className="h-1.5" />
          <p className="text-xs text-muted-foreground">{statusDetail}</p>
        </div>
      </Card>

      <AssessmentFooterSlot
        right={
          <Button
            onClick={onContinue}
            disabled={!canContinue}
            className="transition-all duration-fast"
          >
            {buttonLabel}
            <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        }
      />
    </>
  );
}
