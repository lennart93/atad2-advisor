import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { toast } from "@/components/ui/sonner";
import { Check, Edit } from 'lucide-react';

interface EditableAnswerProps {
  answerId: string;
  questionText: string;
  currentAnswer: string;
  currentExplanation: string;
  riskPoints: number;
  onUpdate: (newAnswer: string, newExplanation: string) => void;
}

export const EditableAnswer: React.FC<EditableAnswerProps> = ({
  answerId,
  questionText,
  currentAnswer,
  currentExplanation,
  riskPoints,
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
      const { error } = await supabase
        .from('atad2_answers')
        .update({
          answer,
          explanation,
        })
        .eq('id', answerId);

      if (error) throw error;

      onUpdate(answer, explanation);
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
          {!isEditing && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsEditing(true)}
              className="h-8 px-2"
            >
              <Edit className="h-3 w-3" />
            </Button>
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
                variant={answer === 'Unknown' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setAnswer('Unknown')}
                className="bg-gray-500 hover:bg-gray-600 text-white border-gray-500 hover:border-gray-600"
              >
                Unknown
              </Button>
            </div>
          ) : (
            <span className="inline-flex items-center gap-1">
              {currentAnswer}
              <span className="text-lg">
                {currentAnswer.toLowerCase() === 'yes' ? '✅' : 
                 currentAnswer.toLowerCase() === 'no' ? '❌' : 
                 currentAnswer.toLowerCase() === 'unknown' ? '❓' : '❓'}
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