import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Check, Edit, HelpCircle } from 'lucide-react';
import { AnswerChangeWarningDialog } from './AnswerChangeWarningDialog';

interface EditableAnswerProps {
  answerId: string;
  questionId: string;
  questionText: string;
  currentAnswer: string;
  currentExplanation: string;
  riskPoints: number;
  readOnly?: boolean;
  sessionId: string;
  onUpdate: (newAnswer: string, newExplanation: string, newRiskPoints: number) => void;
}

export const EditableAnswer: React.FC<EditableAnswerProps> = ({
  answerId,
  questionId,
  questionText,
  currentAnswer,
  currentExplanation,
  riskPoints,
  readOnly = false,
  sessionId,
  onUpdate,
}) => {
  
  const [isEditing, setIsEditing] = useState(false);
  const [answer, setAnswer] = useState(currentAnswer);
  const [explanation, setExplanation] = useState(currentExplanation);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  const [pendingAnswer, setPendingAnswer] = useState<string | null>(null);

  const checkIfAnswerChangeWouldLeadToDifferentQuestions = async (newAnswer: string): Promise<boolean> => {
    try {
      // Get current question's next question for the new answer
      const { data: newNextQuestion, error: newError } = await supabase
        .from('atad2_questions')
        .select('next_question_id')
        .eq('question_id', questionId)
        .eq('answer_option', newAnswer)
        .single();

      if (newError) return false;

      // Get current question's next question for the old answer
      const { data: oldNextQuestion, error: oldError } = await supabase
        .from('atad2_questions')
        .select('next_question_id')
        .eq('question_id', questionId)
        .eq('answer_option', currentAnswer)
        .single();

      if (oldError) return false;

      // If next questions are different, check if any questions were actually answered after this one
      if (newNextQuestion.next_question_id !== oldNextQuestion.next_question_id) {
        // Get all answers for this session that came after this question
        const { data: laterAnswers, error: laterError } = await supabase
          .from('atad2_answers')
          .select('question_id, answered_at')
          .eq('session_id', sessionId)
          .gt('answered_at', (await supabase
            .from('atad2_answers')
            .select('answered_at')
            .eq('id', answerId)
            .single()).data?.answered_at || '');

        if (laterError) return false;

        // If there are questions answered after this one, the change could affect the flow
        return laterAnswers.length > 0;
      }

      return false;
    } catch (error) {
      console.error('Error checking question flow:', error);
      return false;
    }
  };

  const handleAnswerChange = async (newAnswer: string) => {
    if (newAnswer === currentAnswer) {
      setAnswer(newAnswer);
      return;
    }

    const wouldLeadToDifferentQuestions = await checkIfAnswerChangeWouldLeadToDifferentQuestions(newAnswer);
    
    if (wouldLeadToDifferentQuestions) {
      setPendingAnswer(newAnswer);
      setShowWarningDialog(true);
    } else {
      setAnswer(newAnswer);
    }
  };

  const handleConfirmAnswerChange = () => {
    if (pendingAnswer) {
      setAnswer(pendingAnswer);
      setPendingAnswer(null);
    }
    setShowWarningDialog(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Get the risk points for the new answer
      const { data: questionData, error: questionError } = await supabase
        .from('atad2_questions')
        .select('risk_points')
        .eq('question_id', questionId)
        .eq('answer_option', answer)
        .single();

      if (questionError) throw questionError;

      const newRiskPoints = questionData.risk_points;

      // Update the answer with new risk points
      const { error } = await supabase
        .from('atad2_answers')
        .update({
          answer,
          explanation,
          risk_points: newRiskPoints,
        })
        .eq('id', answerId);

      if (error) throw error;

      onUpdate(answer, explanation, newRiskPoints);
      setIsEditing(false);
      setJustSaved(true);
      
      // Show saved indicator briefly
      setTimeout(() => setJustSaved(false), 2000);

      toast.success("Answer updated", {
        description: "Your changes have been saved successfully.",
      });
    } catch (error) {
      console.error('Error updating answer:', error);
      toast.error("Error", {
        description: "Failed to save changes",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setAnswer(currentAnswer);
    setExplanation(currentExplanation);
    setIsEditing(false);
  };

  return (
    <div className="border-b border-border last:border-b-0 pb-4 last:pb-0">
      <div className="flex items-start justify-between mb-2">
        <p className="text-sm font-medium text-muted-foreground flex-1 mr-4">
          {questionText}
        </p>
        <div className="flex items-center gap-2">
          {justSaved && (
            <div className="flex items-center gap-1 text-green-600 text-sm">
              <Check className="h-3 w-3" />
              Saved
            </div>
          )}
          {!isEditing && !readOnly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="h-8 px-2"
            >
              <Edit className="h-3 w-3" />
            </Button>
          )}
          {!isEditing && readOnly && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled
                      className="h-8 px-2 opacity-50 cursor-not-allowed"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Memorandum already generated — responses can no longer be changed</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <span className="text-sm font-medium px-2 py-1 rounded bg-muted">
            {riskPoints} points
          </span>
        </div>
      </div>

      {/* Answer Section */}
      <div className="space-y-3">
        <div>
          <span className="text-sm font-medium">Answer: </span>
          {isEditing ? (
            <div className="flex gap-2 mt-1">
              <Button
                variant={answer === 'Yes' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleAnswerChange('Yes')}
              >
                Yes
              </Button>
              <Button
                variant={answer === 'No' ? 'default' : 'outline'}
                size="sm"
                onClick={() => handleAnswerChange('No')}
              >
                No
              </Button>
              <Button
                variant={answer === 'Unknown' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => handleAnswerChange('Unknown')}
                className="text-gray-700 border-blue-300 hover:bg-blue-50"
              >
                Unknown
              </Button>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1">
              {currentAnswer}
              <span className="text-lg flex items-center">
                {currentAnswer.toLowerCase() === 'yes' ? '✅' : 
                 currentAnswer.toLowerCase() === 'no' ? '❌' : 
                 currentAnswer.toLowerCase() === 'unknown' ? <HelpCircle className="w-5 h-5 text-blue-600" /> : <HelpCircle className="w-5 h-5 text-blue-600" />}
              </span>
            </span>
          )}
        </div>

        {/* Explanation Section */}
        <div>
          <span className="text-sm font-medium">Explanation: </span>
          {isEditing ? (
            <Textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Add explanation..."
              className="mt-1"
              rows={3}
            />
          ) : (
            <span className="text-sm text-muted-foreground">
              {currentExplanation || 'No explanation provided'}
            </span>
          )}
        </div>

        {/* Edit Controls */}
        {isEditing && (
          <div className="flex gap-2 pt-2">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
              disabled={saving}
            >
              Cancel
            </Button>
          </div>
        )}
      </div>

      <AnswerChangeWarningDialog
        open={showWarningDialog}
        onOpenChange={setShowWarningDialog}
        onConfirm={handleConfirmAnswerChange}
        questionText={questionText}
        oldAnswer={currentAnswer}
        newAnswer={pendingAnswer || ''}
      />
    </div>
  );
};