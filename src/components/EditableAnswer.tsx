import React, { useState } from 'react';
import { Button, StatusPill } from '@/components/ds';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Check, Edit, HelpCircle, Lightbulb, X } from 'lucide-react';
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
  // Show the suggestion only when the explanation field is still empty.
  // Once the user has typed (or accepted) anything, the card stays hidden
  // on subsequent edits so they can't accidentally double-paste.
  const showPrefillSuggestion =
    !!prefill &&
    prefill.user_action === "pending" &&
    !readOnly &&
    isEditing &&
    explanation.trim().length === 0;

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

      // Mark any pending prefill as accepted/dismissed so it doesn't reappear
      // the next time the user clicks Edit.
      if (prefill && prefill.user_action === "pending") {
        const finalAction = explanation.trim().length > 0 ? "accepted" : "dismissed";
        updatePrefillAction.mutate({ prefillId: prefill.id, action: finalAction });
      }

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
    <div className={`border-b border-ds-hairline last:border-b-0 pb-4 last:pb-0 rounded-ds-control p-3 -mx-3 transition-colors ${readOnly ? 'bg-ds-fill-muted opacity-75' : ''}`}>
      <div className="flex items-start justify-between mb-2">
        <p className="text-[13px] font-medium flex-1 mr-4 text-ds-ink-secondary">
          {questionText}
        </p>
        <div className="flex items-center gap-2">
          {justSaved && (
            <StatusPill status="complete">
              <Check />
              Saved
            </StatusPill>
          )}
          {!isEditing && !readOnly && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(true)}
              className={`h-8 px-2 ${showMissingExplanationHint ? 'text-ds-ink-secondary' : ''}`}
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
                      className="h-8 px-2"
                    >
                      <Edit className="h-3 w-3" />
                    </Button>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Memorandum already generated. Responses can no longer be changed.</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </div>

      {/* Answer Section */}
      <div className="space-y-3">
        <div>
          <span className="text-[13px] font-medium">Answer: </span>
          {isEditing ? (
            <div className="flex gap-2 mt-1">
              {(["Yes", "No", "Unknown"] as const).map((opt) => {
                const isSuggested =
                  prefill?.suggested_answer === opt.toLowerCase() &&
                  (prefill?.confidence_pct ?? 0) >= 40;
                const isSelected = answer === opt;
                return (
                  <Button
                    key={opt}
                    variant="secondary"
                    size="sm"
                    onClick={() => setAnswer(opt)}
                    aria-pressed={isSelected}
                    className={isSelected ? "border-ds-ink bg-ds-fill-muted" : undefined}
                  >
                    {opt}
                    {isSuggested && (
                      <StatusPill status="neutral" className="ml-2">
                        suggested · <span className="ds-tabular-nums">{prefill?.confidence_pct ?? 0}%</span>
                      </StatusPill>
                    )}
                  </Button>
                );
              })}
            </div>
          ) : (
            currentAnswer.toLowerCase() === 'yes' ? (
              <StatusPill status="neutral">
                <Check />
                Yes
              </StatusPill>
            ) : currentAnswer.toLowerCase() === 'no' ? (
              <StatusPill status="neutral">
                <X />
                No
              </StatusPill>
            ) : (
              <StatusPill status="neutral">
                <HelpCircle />
                {currentAnswer || 'Unknown'}
              </StatusPill>
            )
          )}
        </div>

        {/* Explanation Section */}
        <div>
          <span className="text-[13px] font-medium">Explanation: </span>
          {showPrefillSuggestion && prefill && (
            <div className="mt-2 mb-2 space-y-2 rounded-ds-control bg-ds-fill-muted p-4 text-[13px]">
              <div className="text-[13px] font-medium text-ds-ink-secondary">
                Suggested context from your documents
              </div>
              <p className="whitespace-pre-wrap">{prefill.suggested_toelichting}</p>
              {prefill.source_refs && prefill.source_refs.length > 0 && (
                <div className="text-[13px] text-ds-ink-secondary">
                  From: {prefill.source_refs.map((r, i) => (
                    <span key={i}>{i > 0 ? "; " : ""}{r.doc_label} {r.location}</span>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={acceptPrefillIntoEditor}>Accept</Button>
                <Button size="sm" variant="ghost" onClick={dismissPrefill}>Dismiss</Button>
              </div>
            </div>
          )}
          {isEditing ? (
            <Textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Add explanation..."
              className="mt-1 text-[15px]"
              rows={3}
            />
          ) : (
            <div className="inline-flex flex-col">
              <span className="text-[13px] text-ds-ink-secondary">
                {currentExplanation || 'No explanation provided'}
              </span>
              {showMissingExplanationHint && !currentExplanation && (
                <span className="text-[13px] text-ds-ink-secondary mt-1 flex items-center gap-1">
                  <Lightbulb className="h-3 w-3" />
                  No explanation added yet
                </span>
              )}
            </div>
          )}
        </div>

        {/* Edit Controls */}
        {isEditing && (
          <div className="flex gap-2 pt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
            <Button
              variant="ghost"
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