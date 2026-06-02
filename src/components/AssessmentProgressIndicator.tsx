import { useAssessmentProgress } from "@/stores/assessmentProgressStore";

export function AssessmentProgressIndicator() {
  const active = useAssessmentProgress((s) => s.active);
  const answered = useAssessmentProgress((s) => s.answered);
  const expectedTotal = useAssessmentProgress((s) => s.expectedTotal);

  if (!active || expectedTotal <= 0) return null;

  const pct = Math.min(100, Math.round((answered / expectedTotal) * 100));

  return (
    <div
      role="progressbar"
      aria-label={`Assessment progress: ${answered} of approximately ${expectedTotal} questions`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      className="hidden md:flex flex-1 items-center justify-center px-6 min-w-0"
    >
      <div className="relative h-[2px] w-full max-w-[260px] overflow-hidden rounded-full bg-[hsl(var(--border-subtle))]">
        <div
          className="absolute inset-y-0 left-0 w-full origin-left rounded-full bg-foreground/40 transition-transform duration-500 ease-out motion-reduce:transition-none"
          style={{ transform: `scaleX(${pct / 100})` }}
        />
      </div>
    </div>
  );
}
