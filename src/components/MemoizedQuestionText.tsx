import { memo } from 'react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface QuestionTextProps {
  question: string;
  difficultTerm: string | null;
  termExplanation: string | null;
  exampleText: string | null;
}

export const MemoizedQuestionText = memo(({ question, difficultTerm, termExplanation, exampleText }: QuestionTextProps) => {
  const renderQuestionWithTerms = () => {
    if (!difficultTerm || !termExplanation || difficultTerm.toLowerCase().startsWith('example')) {
      return question;
    }

    const termRegex = new RegExp(`\\b${difficultTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
    const parts = question.split(termRegex);
    const matches = question.match(termRegex);

    if (!matches || parts.length === 1) {
      return question;
    }

    return (
      <>
        {parts.map((part, index) => (
          <span key={index}>
            {part}
            {index < matches.length && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="font-semibold text-blue-800 hover:bg-blue-50 rounded-sm px-1 cursor-pointer transition-colors duration-200">
                      {matches[index]}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm p-3 bg-white border shadow-md rounded">
                    <div className="flex items-start gap-2">
                      <span className="text-lg">💡</span>
                      <div>
                        <span className="font-semibold text-slate-800 block mb-1">
                          {difficultTerm}
                        </span>
                        <p className="text-sm leading-relaxed text-slate-700">
                          {termExplanation}
                        </p>
                      </div>
                    </div>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </span>
        ))}
      </>
    );
  };

  return (
    <>
      {renderQuestionWithTerms()}
      {exampleText && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="ml-2 text-blue-700 text-base cursor-pointer hover:bg-blue-50 rounded-sm px-1 transition-colors duration-200"
              >
                📘
              </button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Click to view example</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </>
  );
});