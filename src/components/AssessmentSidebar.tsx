import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Circle } from "lucide-react";

interface AssessmentSidebarProps {
  questionHistory: {question: any, answer: string}[];
  currentQuestion: any;
  allQuestions: any[];
}

export const AssessmentSidebar = ({ questionHistory, currentQuestion, allQuestions }: AssessmentSidebarProps) => {
  // Group questions by their titles to show overview
  const getQuestionTitle = (questionId: string) => {
    const question = allQuestions.find(q => q.question_id === questionId);
    return question?.question_title || `Question ${questionId}`;
  };

  // Create a map of answered questions
  const answeredQuestions = new Map();
  questionHistory.forEach(item => {
    answeredQuestions.set(item.question.question_id, item.answer);
  });

  // Get unique question titles from history and current question
  const coveredQuestionIds = new Set([
    ...questionHistory.map(h => h.question.question_id),
    ...(currentQuestion ? [currentQuestion.question_id] : [])
  ]);

  const coveredTitles = Array.from(coveredQuestionIds)
    .map(id => ({
      id,
      title: getQuestionTitle(id),
      answer: answeredQuestions.get(id),
      isCurrent: currentQuestion?.question_id === id
    }))
    .sort((a, b) => parseInt(a.id) - parseInt(b.id));

  return (
    <Card className="h-fit sticky top-4">
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Assessment Progress</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {coveredTitles.map((item) => (
          <div
            key={item.id}
            className={`flex items-start gap-3 p-3 rounded-lg transition-colors ${
              item.isCurrent 
                ? 'bg-blue-50 border border-blue-200' 
                : item.answer 
                  ? 'bg-green-50 border border-green-200' 
                  : 'bg-gray-50 border border-gray-200'
            }`}
          >
            <div className="flex-shrink-0 mt-0.5">
              {item.answer ? (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              ) : (
                <Circle className={`h-4 w-4 ${item.isCurrent ? 'text-blue-600' : 'text-gray-400'}`} />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className={`text-sm font-medium ${
                item.isCurrent ? 'text-blue-800' : item.answer ? 'text-green-800' : 'text-gray-700'
              }`}>
                {item.title}
              </div>
              {item.answer && (
                <div className="text-xs text-gray-600 mt-1">
                  Answer: <span className="font-medium">{item.answer}</span>
                </div>
              )}
              {item.isCurrent && !item.answer && (
                <div className="text-xs text-blue-600 mt-1 font-medium">
                  Current question
                </div>
              )}
            </div>
          </div>
        ))}
        
        {coveredTitles.length === 0 && (
          <div className="text-center text-gray-500 text-sm py-4">
            Questions will appear here as you progress
          </div>
        )}
      </CardContent>
    </Card>
  );
};