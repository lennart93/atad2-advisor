import React, { useState } from 'react';
import { Button, StatusPill } from '@/components/ds';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Check, ChevronDown, Edit, HelpCircle, Plus, X } from 'lucide-react';
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

  // The answer's canonical key drives the coloured pill. Yes / No / Unknown are
  // three equal, final answers; none of them carries a warning skin.
  const answerKey = (currentAnswer || '').trim().toLowerCase();

  // Whether this answer already carries reasoning. The legacy sentinel
  // "No explanation provided" counts as empty so it reads as "needs context".
  const explanationText = (currentExplanation || '').trim();
  const hasExplanation = explanationText.length > 0 && explanationText !== 'No explanation provided';

  const [isEditing, setIsEditing] = useState(false);
  const [answer, setAnswer] = useState(currentAnswer);
  const [explanation, setExplanation] = useState(currentExplanation);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [showWarningDialog, setShowWarningDialog] = useState(false);
  // Every row starts collapsed and opens on click, Unknown included.
  const [expanded, setExpanded] = useState(false);
  // Inline "Your reasoning" editor (shown when an answer has no explanation yet
  // and the row is expanded). Saves just the explanation, never the answer.
  const [reasoningDraft, setReasoningDraft] = useState('');
  const [savingReasoning, setSavingReasoning] = useState(false);

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

  // Save the inline reasoning without touching the answer or its risk points.
  // The parent's onUpdate refreshes currentExplanation, which flips this row
  // from the "+ Add context" chip to the calm "Explanation added" marker.
  const handleSaveReasoning = async () => {
    const text = reasoningDraft.trim();
    if (!text) return;

    setSavingReasoning(true);
    try {
      const { error } = await supabase
        .from('atad2_answers')
        .update({ explanation: text })
        .eq('id', answerId);

      if (error) throw error;

      onUpdate(currentAnswer, text, riskPoints);
      toast.success('Context saved', {
        description: 'Your reasoning has been saved with this answer.',
      });
    } catch (error) {
      console.error('Error saving context:', error);
      toast.error('Failed to save context');
    } finally {
      setSavingReasoning(false);
    }
  };

  // The view-mode answer marker: an opaque pill in the fixed left column, color
  // coded so the whole list scans as one column of Yes / No / Unknown. Yes =
  // sage, No = terracotta, Unknown = slate. The answer is the anchor.
  const answerPill = (() => {
    const base =
      'inline-flex items-center gap-1.5 rounded-ds-chip border bg-ds-card px-2.5 py-1 text-[13px] [&_svg]:h-3.5 [&_svg]:w-3.5 [&_svg]:shrink-0';
    if (answerKey === 'yes')
      return <span className={`${base} border-ds-green text-ds-green-text`}><Check />Yes</span>;
    if (answerKey === 'no')
      return <span className={`${base} border-ds-accent text-ds-accent-text`}><X />No</span>;
    return (
      <span className={`${base} border-ds-blue text-ds-blue-text`}>
        <HelpCircle />
        {currentAnswer || 'Unknown'}
      </span>
    );
  })();

  const warningDialog = (
    <AnswerChangeWarningDialog
      open={showWarningDialog}
      onOpenChange={setShowWarningDialog}
      onConfirm={handleConfirmSave}
      onCancel={handleCancelWarning}
      questionText={questionText}
      oldAnswer={currentAnswer}
      newAnswer={answer}
    />
  );

  // Edit mode keeps the existing inline editor (answer chips + prefill +
  // explanation textarea); only the resting/view row was restyled.
  if (isEditing) {
    return (
      <div className="bg-ds-fill-muted px-8 py-5">
        <p className="mb-3 text-[15.5px] leading-snug text-ds-ink">{questionText}</p>
        <div className="space-y-3">
          <div>
            <span className="text-[13px] font-normal">Answer: </span>
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
          </div>

          <div>
            <span className="text-[13px] font-normal">Explanation: </span>
            {showPrefillSuggestion && prefill && (
              <div className="mt-2 mb-2 space-y-2 rounded-ds-control bg-ds-card border border-ds-hairline p-4 text-[13px]">
                <div className="text-[13px] font-normal text-ds-ink-secondary">
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
            <Textarea
              value={explanation}
              onChange={(e) => setExplanation(e.target.value)}
              placeholder="Add explanation..."
              className="mt-1 text-[15px]"
              rows={3}
            />
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={handleSave} disabled={saving}>
              {saving ? 'Saving...' : 'Save changes'}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleCancel} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
        {warningDialog}
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-[8rem_minmax(0,1fr)_auto] items-start gap-x-4 px-8 py-4 transition-colors ${readOnly ? 'bg-ds-fill-muted' : ''}`}>
      {/* Answer anchor — fixed left column */}
      <div className="pt-0.5">{answerPill}</div>

      {/* Question + always-visible context-state marker */}
      <div className="min-w-0">
        <p className={`text-[15.5px] leading-snug ${readOnly ? 'text-ds-ink-secondary' : 'text-ds-ink'}`}>{questionText}</p>

        {/* A live, always-visible marker so a reviewer can see at a glance,
            without expanding, whether an answer still wants reasoning. */}
        {hasExplanation ? (
          <>
            <p className="mt-2.5 flex items-center gap-1.5 text-[12.5px] text-ds-green-text">
              <Check className="h-3.5 w-3.5 shrink-0" />
              Explanation added
            </p>
            {(expanded || readOnly) && (
              // Revealed explanation as a single left-anchored memo excerpt: an
              // (always shown once the memo is locked, since the toggle is gone).
              // "Explanation" eyebrow and a 2px terracotta rule down the left.
              // No source rail here; the right-side whitespace is intentional
              // margin, not an empty reserved column.
              <div className="mt-3 -mx-4 max-w-[880px] rounded-[4px] bg-[#fbfaf7] px-4 py-4">
                <div className="border-l-2 border-brand-terracotta pl-[22px]">
                  <p className="mb-2.5 text-[11px] font-medium uppercase tracking-[0.14em] text-ds-ink-secondary">
                    Explanation
                  </p>
                  <p className="max-w-[820px] text-[14.5px] leading-[1.7] text-ds-ink-secondary">
                    {explanationText}
                  </p>
                </div>
              </div>
            )}
          </>
        ) : !readOnly ? (
          expanded ? (
            // Inline "Your reasoning" editor on a calm ground, pulled out 16px.
            <div className="mt-3 -mx-4 rounded-[4px] bg-[#fbfaf7] px-4 py-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-ds-ink-tertiary">
                Your reasoning
              </p>
              <textarea
                value={reasoningDraft}
                onChange={(e) => setReasoningDraft(e.target.value)}
                placeholder="Note why this answer holds, or what the documents show. Optional, but it strengthens the memorandum."
                className="mt-2 min-h-[84px] w-full rounded-[6px] border border-ds-hairline bg-[#fffdf9] px-3 py-2 text-[14px] leading-relaxed text-ds-ink placeholder:text-ds-ink-tertiary focus:border-ds-accent focus:outline-none focus:ring-[3px] focus:ring-[rgba(194,92,60,0.12)]"
              />
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleSaveReasoning}
                  disabled={savingReasoning || reasoningDraft.trim().length === 0}
                >
                  <Check className="text-[#e0a48f]" />
                  Save context
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setReasoningDraft('');
                    setExpanded(false);
                  }}
                  disabled={savingReasoning}
                >
                  Not now
                </Button>
                <span className="text-[12px] text-ds-ink-tertiary">Optional. Included in the memorandum.</span>
              </div>
            </div>
          ) : (
            // Inviting dashed terracotta chip — expands into the editor.
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-dashed border-[rgba(194,92,60,0.5)] bg-[#faf2ee] py-[5px] pl-[10px] pr-[13px] text-[12.5px] text-ds-accent-text transition-colors hover:border-solid hover:border-ds-accent hover:bg-ds-card"
            >
              <Plus className="h-3.5 w-3.5" />
              Add context
            </button>
          )
        ) : (
          // Read-only (memo generated), no reasoning: a quiet muted note.
          <p className="mt-2.5 text-[12.5px] text-ds-ink-tertiary">No explanation added</p>
        )}
      </div>

      {/* Controls — quiet pencil (edit) + chevron */}
      <div className="flex items-center gap-0.5">
        {justSaved && (
          <StatusPill status="complete" className="mr-1">
            <Check />
            Saved
          </StatusPill>
        )}
        {!readOnly ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsEditing(true)}
            aria-label="Edit answer"
            className="h-8 w-8 p-0 text-ds-ink-tertiary hover:text-ds-ink"
          >
            <Edit className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button variant="ghost" size="sm" disabled aria-label="Editing locked" className="h-8 w-8 p-0">
                    <Edit className="h-3.5 w-3.5" />
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                <p>Memorandum already generated. Responses can no longer be changed.</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
        {/* Chevron is an editing-time affordance only. Once the memo is locked
            the reasoning is shown inline automatically, so there is nothing left
            to toggle and the arrow is dropped (no dead, clickable control). */}
        {!readOnly && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Hide explanation' : 'Show explanation'}
            className="h-8 w-8 p-0 text-ds-ink-tertiary hover:text-ds-ink"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </Button>
        )}
      </div>

      {warningDialog}
    </div>
  );
};