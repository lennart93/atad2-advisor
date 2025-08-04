import { CheckCircle, Circle, AlertTriangle, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";

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
  onQuestionClick?: (questionIndex: number) => void;
}

export function AssessmentSidebar({ answers, questionHistory, currentQuestion, onQuestionClick }: AssessmentSidebarProps) {
  const totalAnswered = questionHistory.length;
  
  return (
    <div className="w-full bg-muted/30 border border-border rounded-lg p-6 overflow-y-auto max-h-[calc(100vh-200px)] sticky top-6">
      <div className="pb-4 mb-4 border-b border-border">
        <h3 className="text-lg font-semibold text-foreground">ATAD2 Progress</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {totalAnswered} questions answered
        </p>
      </div>
      
      <div className="space-y-3">
        {/* Show answered questions in order */}
        {questionHistory.map((entry, index) => {
          const hasRisk = entry.question.risk_points > 0 && entry.answer === "Yes";
          const isCurrentlyViewing = currentQuestion?.question_id === entry.question.question_id;
          
          return (
            <button
              key={`${entry.question.question_id}-${index}`}
              onClick={() => onQuestionClick?.(index)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onQuestionClick?.(index);
                }
              }}
              className={cn(
                "w-full p-3 rounded-md border transition-all cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-primary/50",
                isCurrentlyViewing 
                  ? "border-primary bg-primary/5 font-semibold" 
                  : "border-muted-foreground/20 bg-card hover:bg-muted/50"
              )}
              aria-label={`Review question ${entry.question.question_id}: ${entry.question.question_title || `Question ${entry.question.question_id}`}. Current answer: ${entry.answer}`}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <CheckCircle className={cn(
                    "h-4 w-4",
                    isCurrentlyViewing ? "text-primary" : "text-muted-foreground"
                  )} />
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Q{entry.question.question_id}
                    </span>
                    {hasRisk && (
                      <AlertTriangle className="h-3 w-3 text-destructive" />
                    )}
                  </div>
                  
                  <h4 className={cn(
                    "text-sm font-medium leading-tight mt-1",
                    isCurrentlyViewing ? "text-primary" : "text-foreground"
                  )}>
                    {entry.question.question_title || `Question ${entry.question.question_id}`}
                  </h4>
                  
                  <div className="flex items-center gap-2 mt-2">
                    <div className={cn(
                      "flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium",
                      entry.answer === "Yes"
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-red-50 text-red-700 border border-red-200"
                    )}>
                      {entry.answer === "Yes" ? (
                        <Check className="h-3 w-3 text-green-600" />
                      ) : (
                        <X className="h-3 w-3 text-red-600" />
                      )}
                      <span className={entry.answer === "Yes" ? "text-green-600" : "text-red-600"}>
                        {entry.answer}
                      </span>
                    </div>
                    {hasRisk && (
                      <span className="text-xs text-muted-foreground">
                        {entry.question.risk_points} risk points
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </button>
          );
        })}
        
        {/* Show current question if it's not already in history (new question) */}
        {currentQuestion && !questionHistory.find(entry => entry.question.question_id === currentQuestion.question_id) && (
          <div className="p-3 rounded-md border border-primary bg-primary/5 transition-colors">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <Circle className="h-4 w-4 text-primary" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Q{currentQuestion.question_id}
                  </span>
                </div>
                
                <h4 className="text-sm font-semibold leading-tight mt-1 text-primary">
                  {currentQuestion.question_title || `Question ${currentQuestion.question_id}`}
                </h4>
                
                <div className="mt-2">
                  <span className="text-xs text-muted-foreground font-medium">
                    Currently answering...
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}