import React, { useState, useEffect, useCallback } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';

interface DirectExplanationInputProps {
  sessionId: string;
  questionId: string;
  placeholder?: string;
  className?: string;
}

/**
 * Direct database-backed explanation input that bypasses the store entirely.
 * Each question gets its own isolated explanation without any cross-contamination.
 */
export const DirectExplanationInput: React.FC<DirectExplanationInputProps> = ({
  sessionId,
  questionId,
  placeholder = "Enter your explanation here...",
  className = ""
}) => {
  const [explanation, setExplanation] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  
  // Debounced save to database
  const [debouncedExplanation] = useDebounce(explanation, 800);

  // Load initial explanation from database
  useEffect(() => {
    const loadExplanation = async () => {
      setIsLoading(true);
      try {
        const { data } = await supabase
          .from('atad2_answers')
          .select('explanation')
          .eq('session_id', sessionId)
          .eq('question_id', questionId)
          .maybeSingle();

        const currentExplanation = data?.explanation || '';
        setExplanation(currentExplanation);
        console.log(`🔄 Loaded explanation for Q${questionId}: "${currentExplanation}"`);
      } catch (error) {
        console.error('Error loading explanation:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (sessionId && questionId) {
      loadExplanation();
    }
  }, [sessionId, questionId]);

  // Save to database when debounced value changes
  useEffect(() => {
    const saveExplanation = async () => {
      if (isLoading) return; // Don't save while loading
      
      setIsSaving(true);
      try {
        const { error } = await supabase
          .from('atad2_answers')
          .update({ explanation: debouncedExplanation })
          .eq('session_id', sessionId)
          .eq('question_id', questionId);

        if (error) throw error;
        
        console.log(`💾 Saved explanation for Q${questionId}: "${debouncedExplanation}"`);
      } catch (error) {
        console.error('Error saving explanation:', error);
      } finally {
        setIsSaving(false);
      }
    };

    if (debouncedExplanation !== undefined && !isLoading) {
      saveExplanation();
    }
  }, [debouncedExplanation, sessionId, questionId, isLoading]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setExplanation(newValue);
    console.log(`📝 Input changed for Q${questionId}: "${newValue}"`);
  }, [questionId]);

  if (isLoading) {
    return (
      <Textarea
        disabled
        placeholder="Loading..."
        className={className}
      />
    );
  }

  return (
    <div className="space-y-2">
      <Textarea
        value={explanation}
        onChange={handleChange}
        placeholder={placeholder}
        className={`min-h-[100px] ${className}`}
        disabled={isSaving}
      />
      {isSaving && (
        <div className="text-xs text-muted-foreground">
          Saving...
        </div>
      )}
    </div>
  );
};