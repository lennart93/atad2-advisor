import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { AssessmentFooterSlot } from "@/components/assessment/AssessmentFooterSlot";
import { usePrefillJob, useAllPrefills } from "@/hooks/usePrefill";
import { useUiBusySignal } from "@/stores/uiBusyStore";
import { ArrowRight } from "lucide-react";

// After this many ms we let the user start even if the job hasn't finished,
// with a clear "anyway" label. Set well above the worst-case swarm time
// (~90s with a raw PDF at concurrency 4) so the honest path almost always
// wins.
const WAIT_TIMEOUT_MS = 180_000;

interface Props {
  sessionId: string;
  onContinue: () => void;
}

export function AnalyzeProgress({ sessionId, onContinue }: Props) {
  const { data: job } = usePrefillJob(sessionId);
  const { data: prefills } = useAllPrefills(sessionId);

  // Total distinct question count comes from the questions table. We need
  // this to compute *real* progress; the previous time-based ease curve
  // looked plausible but unlocked the Continue button as soon as a single
  // prefill landed (1 of 49 = "ready"), which is why users routinely
  // outran the swarm and saw empty suggestions on Q1-Q3.
  const { data: totalQuestions } = useQuery({
    queryKey: ["atad2-question-count"],
    queryFn: async () => {
      const { data } = await supabase
        .from("atad2_questions")
        .select("question_id");
      if (!data) return null;
      return new Set(data.map((q) => q.question_id)).size;
    },
    staleTime: 60 * 60 * 1000,
  });

  const [timedOut, setTimedOut] = useState(false);
  const startedAtRef = useRef<number>(Date.now());

  const prefillCount = prefills?.length ?? 0;
  const total = totalQuestions ?? null;
  const completed = job?.status === "completed";
  const failed = job?.status === "failed";

  // Ready means the swarm actually finished. If for some reason the job
  // status didn't flip (browser closed mid-run, etc.) but we have a
  // full-coverage prefill count, treat that as ready too.
  const fullCoverage = total != null && prefillCount >= total;
  const ready = completed || fullCoverage;

  // Real progress: prefill rows over expected total.
  const realPct = total != null
    ? Math.min(100, Math.round((prefillCount / total) * 100))
    : null;

  // Time-based curve runs to 100% over the full WAIT_TIMEOUT window so the
  // bar never visually hangs between prefill writes. The "honesty signal"
  // is the X/Y count badge in the corner; the bar's job is to feel alive.
  // Real progress can push pct higher (e.g. swarm finishes fast) but the
  // curve keeps the floor moving so users don't think we've frozen.
  const [fallbackPct, setFallbackPct] = useState(0);
  useEffect(() => {
    if (ready) {
      setFallbackPct(100);
      return;
    }
    const tick = window.setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      const fraction = Math.min(1, elapsed / WAIT_TIMEOUT_MS);
      const eased = 1 - Math.pow(1 - fraction, 1.6);
      setFallbackPct(Math.min(99, eased * 100));
      if (elapsed >= WAIT_TIMEOUT_MS) {
        window.clearInterval(tick);
        setTimedOut(true);
      }
    }, 500);
    return () => window.clearInterval(tick);
  }, [ready]);

  const pct = ready ? 100 : (realPct != null ? Math.max(realPct, fallbackPct) : fallbackPct);

  const canContinue = ready || timedOut || failed;
  const buttonLabel = !ready && (timedOut || failed) ? "Start questions anyway" : "Start questions";

  useUiBusySignal(!ready && !failed && !timedOut);

  const statusLabel = failed
    ? "Couldn't process documents"
    : ready
    ? "Suggestions ready"
    : timedOut
    ? "Still working in the background"
    : "Reading your documents…";

  const countBadge = total != null && prefillCount > 0
    ? `${prefillCount} / ${total}`
    : null;

  // Only render a detail line for terminal states. While we're actively
  // reading the bar + status label + count badge already say everything,
  // so we keep that area quiet.
  const statusDetail = failed
    ? "You can start the questions now; suggestions may still appear inline if the analysis recovers in the background."
    : ready
    ? "All suggestions are in. You can start the questions now."
    : timedOut
    ? "We didn't finish in time. You can start the questions now; remaining suggestions will appear inline as they arrive."
    : null;

  return (
    <>
      <Card className="p-5">
        <div className="space-y-2">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium tracking-tight">{statusLabel}</p>
            <span className="text-xs tabular-nums text-muted-foreground">
              {countBadge ? `${countBadge}  ·  ` : ""}{Math.round(pct)}%
            </span>
          </div>
          <Progress value={pct} className="h-1.5" />
          {statusDetail && <p className="text-xs text-muted-foreground">{statusDetail}</p>}
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
