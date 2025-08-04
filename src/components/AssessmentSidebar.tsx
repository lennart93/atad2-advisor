import { CheckCircle, Circle, AlertTriangle } from "lucide-react";
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
}

export function AssessmentSidebar({ answers, questionHistory, currentQuestion }: AssessmentSidebarProps) {
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
          
          return (
            <div
              key={`${entry.question.question_id}-${index}`}
              className="p-3 rounded-md border border-muted-foreground/20 bg-card transition-colors"
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  <CheckCircle className="h-4 w-4 text-primary" />
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
                  
                  <h4 className="text-sm font-medium leading-tight mt-1 text-foreground">
                    {entry.question.question_title || `Question ${entry.question.question_id}`}
                  </h4>
                  
                  <div className="flex items-center gap-2 mt-2">
                    <span className={cn(
                      "text-xs px-2 py-0.5 rounded",
                      entry.answer === "Yes"
                        ? "bg-destructive/10 text-destructive"
                        : "bg-primary/10 text-primary"
                    )}>
                      {entry.answer}
                    </span>
                    {hasRisk && (
                      <span className="text-xs text-muted-foreground">
                        {entry.question.risk_points} risk points
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        
        {/* Show current question if exists */}
        {currentQuestion && (
          <div className="p-3 rounded-md border border-primary bg-primary/5 transition-colors">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <Circle className="h-4 w-4 text-muted-foreground" />
              </div>
              
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-muted-foreground">
                    Q{currentQuestion.question_id}
                  </span>
                </div>
                
                <h4 className="text-sm font-medium leading-tight mt-1 text-primary">
                  {currentQuestion.question_title || `Question ${currentQuestion.question_id}`}
                </h4>
                
                <div className="mt-2">
                  <span className="text-xs text-muted-foreground">
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