import { Check, X, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/ds";
import { useEffect, useRef } from "react";

interface AssessmentSidebarProps {
  answers: Record<string, string>;
  questionHistory: Array<{
    question: {
      question_id: string;
      question_title: string | null;
      risk_points: number;
    };
    answer: string;
  }>;
  currentQuestion: {
    question_id: string;
    question_title: string | null;
    risk_points: number;
  } | null;
  pendingQuestion: {
    question_id: string;
    question_title: string | null;
    risk_points: number;
  } | null;
  onQuestionClick?: (questionIndex: number) => void;
  onPendingQuestionClick?: () => void;
}

export function AssessmentSidebar({
  answers: _answers,
  questionHistory,
  currentQuestion,
  pendingQuestion,
  onQuestionClick,
  onPendingQuestionClick,
}: AssessmentSidebarProps) {
  const totalAnswered = questionHistory.length;
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [questionHistory.length]);

  // Only render when there is something to show: at least one answered item
  // or a pending item. Otherwise the thin header progress line carries the
  // progress signal on its own.
  if (questionHistory.length === 0 && !pendingQuestion) {
    return null;
  }

  return (
    <div className="sticky top-6 flex max-h-[calc(100vh-200px)] w-full flex-col overflow-hidden rounded-ds-card border border-ds-hairline bg-ds-card">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b border-ds-hairline bg-ds-card p-5 pb-4">
        <h3 className="text-[15px] font-medium tracking-tight text-ds-ink">ATAD2 progress</h3>
        <p className="mt-1 text-[13px] text-ds-ink-secondary ds-tabular-nums">{totalAnswered} questions answered</p>
      </div>

      {/* Scrollable content */}
      <div ref={scrollContainerRef} className="flex-1 scroll-smooth overflow-y-auto p-4">
        <ul className="flex flex-col gap-2">
          {questionHistory.map((entry, index) => {
            const isActive = currentQuestion?.question_id === entry.question.question_id;
            const label = entry.question.question_title ?? "";
            return (
              <li key={`${entry.question.question_id}-${index}`}>
                <button
                  type="button"
                  onClick={() => onQuestionClick?.(index)}
                  className={cn(
                    "group w-full rounded-ds-control border bg-ds-card px-3.5 py-3 text-left animate-fade-in",
                    "transition-colors duration-fast ease-emphasized",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    isActive
                      ? "border-ds-ink"
                      : "border-ds-hairline hover:bg-ds-fill-muted",
                  )}
                  aria-current={isActive ? "step" : undefined}
                  aria-label={`Review answer: ${label || "previous question"}. Current answer: ${entry.answer}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-ds-ink text-ds-card">
                      <Check className="h-[11px] w-[11px]" strokeWidth={2.5} />
                    </span>
                    <AnswerPill answer={entry.answer} />
                  </div>
                  {label && (
                    <h4 className="mt-2 break-words text-[13px] font-medium leading-snug tracking-[-0.005em] text-ds-ink">
                      {label}
                    </h4>
                  )}
                </button>
              </li>
            );
          })}

          {pendingQuestion &&
            !questionHistory.find((e) => e.question.question_id === pendingQuestion.question_id) && (
              <li>
                <button
                  type="button"
                  onClick={() => onPendingQuestionClick?.()}
                  className={cn(
                    "group w-full rounded-ds-control border border-ds-hairline bg-ds-fill-muted px-3.5 py-3 text-left animate-fade-in",
                    "transition-colors duration-fast ease-emphasized",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  )}
                  aria-label={`Pending question${pendingQuestion.question_title ? `: ${pendingQuestion.question_title}` : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-ds-hairline" />
                    <StatusPill status="neutral">Pending</StatusPill>
                  </div>
                  {pendingQuestion.question_title && (
                    <h4 className="mt-2 break-words text-[13px] font-medium leading-snug tracking-[-0.005em] text-ds-ink-secondary">
                      {pendingQuestion.question_title}
                    </h4>
                  )}
                </button>
              </li>
            )}
        </ul>
      </div>
    </div>
  );
}

function AnswerPill({ answer }: { answer: string }) {
  const isYes = answer === "Yes";
  const isNo = answer === "No";
  return (
    <StatusPill status={!isYes && !isNo ? "insufficient" : "neutral"}>
      {isYes ? (
        <Check className="h-[11px] w-[11px]" strokeWidth={2.5} />
      ) : isNo ? (
        <X className="h-[11px] w-[11px]" strokeWidth={2.5} />
      ) : (
        <HelpCircle className="h-[11px] w-[11px]" strokeWidth={2.5} />
      )}
      {answer}
    </StatusPill>
  );
}
