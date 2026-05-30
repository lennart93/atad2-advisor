import { Check, X, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
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

  return (
    <div className="sticky top-6 flex max-h-[calc(100vh-200px)] w-full flex-col overflow-hidden rounded-lg border border-border bg-muted/30">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 border-b border-[hsl(var(--border-subtle))] bg-muted/30 p-6 pb-4">
        <h3 className="text-lg font-semibold tracking-tight text-foreground">ATAD2 progress</h3>
        <p className="mt-1 text-sm text-muted-foreground">{totalAnswered} questions answered</p>
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
                    "group w-full rounded-[10px] border bg-card px-3.5 py-3 text-left shadow-xs animate-fade-in",
                    "transition-[border-color,box-shadow,background-color] duration-fast ease-emphasized",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    isActive
                      ? "border-foreground/25 shadow-sm ring-[3px] ring-foreground/5"
                      : "border-[hsl(var(--border-default))] hover:border-[hsl(var(--border-strong))] hover:shadow-sm",
                  )}
                  aria-current={isActive ? "step" : undefined}
                  aria-label={`Review answer: ${label || "previous question"}. Current answer: ${entry.answer}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full bg-foreground text-background">
                      <Check className="h-[11px] w-[11px]" strokeWidth={2.5} />
                    </span>
                    <AnswerPill answer={entry.answer} />
                  </div>
                  {label && (
                    <h4 className="mt-2 break-words text-[13px] font-medium leading-snug tracking-[-0.005em] text-foreground">
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
                    "group w-full rounded-[10px] border border-dashed border-[hsl(var(--border-default))] bg-muted/40 px-3.5 py-3 text-left animate-fade-in",
                    "transition-colors duration-fast ease-emphasized",
                    "hover:border-[hsl(var(--border-strong))] hover:bg-muted/60",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  )}
                  aria-label={`Pending question${pendingQuestion.question_title ? `: ${pendingQuestion.question_title}` : ""}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex h-[18px] w-[18px] flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-[hsl(var(--border-strong))]" />
                    <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground bg-muted">
                      Pending
                    </span>
                  </div>
                  {pendingQuestion.question_title && (
                    <h4 className="mt-2 break-words text-[13px] font-medium leading-snug tracking-[-0.005em] text-muted-foreground">
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
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium tabular-nums",
        isYes && "bg-emerald-500/[0.08] text-emerald-700 dark:text-emerald-400",
        isNo && "bg-red-500/[0.08] text-red-700 dark:text-red-400",
        !isYes && !isNo && "bg-blue-500/[0.08] text-blue-700 dark:text-blue-400",
      )}
    >
      {isYes ? (
        <Check className="h-[11px] w-[11px]" strokeWidth={2.5} />
      ) : isNo ? (
        <X className="h-[11px] w-[11px]" strokeWidth={2.5} />
      ) : (
        <HelpCircle className="h-[11px] w-[11px]" strokeWidth={2.5} />
      )}
      {answer}
    </span>
  );
}
