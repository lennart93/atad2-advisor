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

  // Only render when there is something to show: at least one answered item
  // or a pending item. Otherwise the thin header progress line carries the
  // progress signal on its own.
  if (questionHistory.length === 0 && !pendingQuestion) {
    return null;
  }

  return (
    <div className="sticky top-6 flex max-h-[calc(100vh-200px)] w-full flex-col">
      {/* Header eyebrow */}
      <div className="pb-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-ds-ink-secondary">
          ATAD2 progress
        </p>
        <p className="mt-1 text-[13px] text-ds-ink-secondary ds-tabular-nums">
          {totalAnswered} answered
        </p>
      </div>

      {/* Hairline rows: topic left, answer right in its semantic colour. */}
      <div ref={scrollContainerRef} className="flex-1 scroll-smooth overflow-y-auto">
        <ul className="flex flex-col">
          {questionHistory.map((entry, index) => {
            const isActive = currentQuestion?.question_id === entry.question.question_id;
            const label = entry.question.question_title ?? "";
            return (
              <li key={`${entry.question.question_id}-${index}`}>
                <button
                  type="button"
                  onClick={() => onQuestionClick?.(index)}
                  className={cn(
                    "group flex w-full items-start justify-between gap-3 border-b border-ds-hairline py-3 text-left animate-fade-in-soft",
                    "transition-colors duration-fast ease-emphasized hover:text-ds-ink",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  )}
                  aria-current={isActive ? "step" : undefined}
                  aria-label={`Review answer: ${label || "previous question"}. Current answer: ${entry.answer}`}
                >
                  <span className="flex min-w-0 flex-1 items-start gap-2">
                    {isActive && (
                      <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-ds-accent" />
                    )}
                    <span
                      className={cn(
                        "break-words text-[13px] leading-snug tracking-[-0.005em]",
                        isActive ? "font-medium text-ds-ink" : "font-normal text-ds-ink",
                      )}
                    >
                      {label || "Question"}
                    </span>
                  </span>
                  <AnswerValue answer={entry.answer} />
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
                    "group flex w-full items-start justify-between gap-3 border-b border-ds-hairline py-3 text-left animate-fade-in-soft",
                    "transition-colors duration-fast ease-emphasized",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  )}
                  aria-current="step"
                  aria-label={`Current question${pendingQuestion.question_title ? `: ${pendingQuestion.question_title}` : ""}`}
                >
                  <span className="break-words text-[13px] font-medium leading-snug tracking-[-0.005em] text-ds-ink">
                    {pendingQuestion.question_title || "Current question"}
                  </span>
                  <span className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-ds-accent" />
                </button>
              </li>
            )}
        </ul>
      </div>
    </div>
  );
}

// Answered value as a soft pill, colour-matched to the answer options so the
// column scans as Yes / No / Unknown: Yes = sage, No = terracotta, Unknown =
// slate. Regular weight, no border; ds tokens are final colours (no /opacity).
function AnswerValue({ answer }: { answer: string }) {
  const key = (answer ?? "").trim().toLowerCase();
  const tone =
    key === "yes"
      ? "bg-ds-green-bg text-ds-green-text"
      : key === "no"
        ? "bg-ds-accent-bg text-ds-accent-text"
        : key === "unknown"
          ? "bg-ds-blue-bg text-ds-blue-text"
          : "bg-ds-fill-muted text-ds-ink-secondary";
  return (
    <span
      className={cn(
        "inline-flex flex-shrink-0 items-center rounded-full px-[9px] py-[2px] text-[12px] font-normal leading-[1.4]",
        tone,
      )}
    >
      {answer}
    </span>
  );
}
