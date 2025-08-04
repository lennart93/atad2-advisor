import { CheckCircle, Circle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AssessmentSidebarProps {
  answers: Record<string, string>;
  questions: Array<{
    question_id: string;
    question_title: string;
    risk_points: number;
  }>;
  currentQuestionId: string;
}

export function AssessmentSidebar({ answers, questions, currentQuestionId }: AssessmentSidebarProps) {
  return (
    <div className="w-full bg-muted/30 border border-border rounded-lg p-6 overflow-y-auto max-h-[calc(100vh-200px)] sticky top-6">
      <div className="pb-4 mb-4 border-b border-border">
        <h3 className="text-lg font-semibold text-foreground">ATAD2 Progress</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {Object.keys(answers).length} of {questions.length} answered
        </p>
      </div>
      
      <div className="space-y-3">
        {questions.map((question) => {
          const isAnswered = answers[question.question_id];
          const isCurrent = question.question_id === currentQuestionId;
          const hasRisk = question.risk_points > 0 && isAnswered === "Yes";
          
          return (
            <div
              key={question.question_id}
              className={cn(
                "p-3 rounded-md border transition-colors",
                isCurrent
                  ? "border-primary bg-primary/5"
                  : isAnswered
                  ? "border-muted-foreground/20 bg-card"
                  : "border-muted-foreground/10 bg-muted/20"
              )}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 mt-0.5">
                  {isAnswered ? (
                    <CheckCircle className="h-4 w-4 text-primary" />
                  ) : (
                    <Circle className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-muted-foreground">
                      Q{question.question_id}
                    </span>
                    {hasRisk && (
                      <AlertTriangle className="h-3 w-3 text-destructive" />
                    )}
                  </div>
                  
                  <h4 className={cn(
                    "text-sm font-medium leading-tight mt-1",
                    isCurrent ? "text-primary" : "text-foreground"
                  )}>
                    {question.question_title}
                  </h4>
                  
                  {isAnswered && (
                    <div className="flex items-center gap-2 mt-2">
                      <span className={cn(
                        "text-xs px-2 py-0.5 rounded",
                        isAnswered === "Yes"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-primary/10 text-primary"
                      )}>
                        {isAnswered}
                      </span>
                      {hasRisk && (
                        <span className="text-xs text-muted-foreground">
                          {question.risk_points} risk points
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}