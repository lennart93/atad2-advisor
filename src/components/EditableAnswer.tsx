import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Check, Edit, HelpCircle } from 'lucide-react';
import { AnswerChangeWarningDialog } from './AnswerChangeWarningDialog';
import { useQuestionPrefill, useUpdatePrefillAction } from '@/hooks/usePrefill';

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
  showMissingExplanationHint?: boolean;
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
  showMissingExplanationHint = false,
}) => {
  
  const [isEditing, setIsEditing] = useState(false);
  const [answer, setAnswer] = useState(currentAnswer);
  const [explanation, setExplanation] = useState(currentExplanation);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [showWarningDialog, setShowWarningDialog] = useState(false);

  // AI prefill suggestion for this question (if any).
  const { data: prefill } = useQuestionPrefill(sessionId, questionId);
  const updatePrefillAction = useUpdatePrefillAction();
  const showPrefillSuggestion =
    !!prefill &&
    prefill.user_action === "pending" &&
    !readOnly &&
    isEditing;

  const acceptPrefillIntoEditor = () => {
    if (!prefill) return;
    const next = explanation.trim().length === 0
      ? prefill.suggested_toelichting
      : `${explanation}\n\n${prefill.suggested_toelichting}`;
    setExplanation(next);
    updatePrefillAction.mutate({ prefillId: prefill.id, action: "accepted" });
  };

  const dismissPrefill = () => {
    if (!prefill) return;
    updatePrefillAction.mutate({ prefillId: prefill.id, action: "dismissed" });
  };

  const checkIfAnswerChangeWouldLeadToDifferentQuestions = async (newAnswer: string): Promise<boolean> => {
    console.log('🔍 Checking answer change impact:', { questionId, currentAnswer, newAnswer, sessionId });
    
    try {
      // Get current question's next question for the new answer
      const { data: newNextQuestion, error: newError } = await supabase
        .from('atad2_questions')
        .select('next_question_id')
        .eq('question_id', questionId)
        .eq('answer_option', newAnswer)
        .single();

      console.log('📋 New answer next question:', newNextQuestion, newError);

      if (newError) {
        console.log('❌ Error getting new next question:', newError);
        return false;
      }

      // Get current question's next question for the old answer
      const { data: oldNextQuestion, error: oldError } = await supabase
        .from('atad2_questions')
        .select('next_question_id')
        .eq('question_id', questionId)
        .eq('answer_option', currentAnswer)
        .single();

      console.log('📋 Old answer next question:', oldNextQuestion, oldError);

      if (oldError) {
        console.log('❌ Error getting old next question:', oldError);
        return false;
      }

      // If next questions are different, check if any questions were actually answered after this one
      const nextQuestionsAreDifferent = newNextQuestion.next_question_id !== oldNextQuestion.next_question_id;
      console.log('🔄 Next questions different?', nextQuestionsAreDifferent, {
        new: newNextQuestion.next_question_id,
        old: oldNextQuestion.next_question_id
      });

      if (nextQuestionsAreDifferent) {
        // Get the timestamp of this answer
        const { data: currentAnswerData, error: currentAnswerError } = await supabase
          .from('atad2_answers')
          .select('answered_at')
          .eq('id', answerId)
          .single();

        if (currentAnswerError) {
          console.log('❌ Error getting current answer timestamp:', currentAnswerError);
          return false;
        }

        console.log('⏰ Current answer timestamp:', currentAnswerData.answered_at);

        // Get all answers for this session that came after this question
        const { data: laterAnswers, error: laterError } = await supabase
          .from('atad2_answers')
          .select('question_id, answered_at')
          .eq('session_id', sessionId)
          .gt('answered_at', currentAnswerData.answered_at);

        console.log('📊 Later answers:', laterAnswers, laterError);

        if (laterError) {
          console.log('❌ Error getting later answers:', laterError);
          return false;
        }

        // If there are questions answered after this one, the change could affect the flow
        const shouldShowWarning = laterAnswers.length > 0;
        console.log('⚠️ Should show warning?', shouldShowWarning, 'Later answers count:', laterAnswers.length);
        return shouldShowWarning;
      }

      console.log('✅ Next questions are the same, no warning needed');
      return false;
    } catch (error) {
      console.error('💥 Error checking question flow:', error);
      return false;
    }
  };

  const handleSave = async () => {
    // Check if the answer has actually changed (not just explanation)
    if (answer !== currentAnswer) {
      const wouldLeadToDifferentQuestions = await checkIfAnswerChangeWouldLeadToDifferentQuestions(answer);
      
      if (wouldLeadToDifferentQuestions) {
        setShowWarningDialog(true);
        return; // Don't save yet, wait for user confirmation
      }
    }
    
    // If no warning needed or only explanation changed, proceed with save
    performSave();
  };

  const performSave = async () => {
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

  const handleConfirmSave = () => {
    setShowWarningDialog(false);
    performSave();
  };

  const handleCancel = () => {
    setAnswer(currentAnswer);
    setExplanation(currentExplanation);
    setIsEditing(false);
  };

  const handleCancelWarning = () => {
    // Reset answer to original value when canceling from warning dialog
    setAnswer(currentAnswer);
    setShowWarningDialog(false);
  };

  return (
    <div className={`border-b border-border last:border-b-0 pb-4 last:pb-0 rounded-lg p-3 -mx-3 transition-colors ${readOnly ? 'bg-muted/50 opacity-75' : ''}`}>
      <div className="flex items-start justify-between mb-2">
        <p className={`text-sm font-medium flex-1 mr-4 ${readOnly ? 'text-muted-foreground/70' : 'text-muted-foreground'}`}>
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
              className={`h-8 px-2 ${showMissingExplanationHint ? 'text-amber-600 animate-pulse' : ''}`}
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
                onClick={() => setAnswer('Yes')}
              >
                Yes
              </Button>
              <Button
                variant={answer === 'No' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAnswer('No')}
              >
                No
              </Button>
              <Button
                variant={answer === 'Unknown' ? 'secondary' : 'outline'}
                size="sm"
                onClick={() => setAnswer('Unknown')}
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
          {showPrefillSuggestion && prefill && (
            <Card className="border-primary/30 bg-primary/5 mt-2 mb-2">
              <CardContent className="space-y-2 pt-3 text-sm">
                <div className="text-xs uppercase tracking-wide text-muted-foreground">
                  Suggested context from your documents
                </div>
                <p className="whitespace-pre-wrap">{prefill.suggested_toelichting}</p>
                {prefill.source_refs && prefill.source_refs.length > 0 && (
                  <div className="text-xs text-muted-foreground">
                    From: {prefill.source_refs.map((r, i) => (
                      <span key={i}>{i > 0 ? "; " : ""}{r.doc_label} {r.location}</span>
                    ))}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button size="sm" onClick={acceptPrefillIntoEditor}>Accept</Button>
                  <Button size="sm" variant="ghost" onClick={dismissPrefill}>Dismiss</Button>
                </div>
              </CardContent>
            </Card>
          )}
          {isEditing ? (
            <Textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Add explanation..."
              className="mt-1"
              rows={3}
            />
          ) : (
            <div className="inline-flex flex-col">
              <span className="text-sm text-muted-foreground">
                {currentExplanation || 'No explanation provided'}
              </span>
              {showMissingExplanationHint && !currentExplanation && (
                <span className="text-xs text-amber-600 mt-1 flex items-center gap-1 animate-pulse">
                  💡 No explanation added yet
                </span>
              )}
            </div>
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
        onConfirm={handleConfirmSave}
        onCancel={handleCancelWarning}
        questionText={questionText}
        oldAnswer={currentAnswer}
        newAnswer={answer}
      />
    </div>
  );
};