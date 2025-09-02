import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from "@/components/ui/sonner";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Check, Edit, HelpCircle } from 'lucide-react';

interface EditableAnswerProps {
  answerId: string;
  questionId: string;
  questionText: string;
  currentAnswer: string;
  currentExplanation: string;
  riskPoints: number;
  readOnly?: boolean;
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
  onUpdate,
}) => {
  
  const [isEditing, setIsEditing] = useState(false);
  const [answer, setAnswer] = useState(currentAnswer);
  const [explanation, setExplanation] = useState(currentExplanation);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

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
    </div>
  );
};