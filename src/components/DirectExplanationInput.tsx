import React, { useState, useEffect, useCallback, useImperativeHandle, forwardRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import { useDebounce } from '@/hooks/useDebounce';

interface DirectExplanationInputProps {
  sessionId: string;
  questionId: string;
  placeholder?: string;
  className?: string;
  onSavingChange?: (isSaving: boolean) => void;
}

export interface DirectExplanationInputRef {
  flushSave: () => Promise<void>;
  isSaving: () => boolean;
}

/**
 * Direct database-backed explanation input that bypasses the store entirely.
 * Each question gets its own isolated explanation without any cross-contamination.
 */
export const DirectExplanationInput = forwardRef<DirectExplanationInputRef, DirectExplanationInputProps>(({
  sessionId,
  questionId,
  placeholder = "Enter your explanation here...",
  className = "",
  onSavingChange
}, ref) => {
  const [explanation, setExplanation] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingExplanation, setPendingExplanation] = useState<string | null>(null);
  
  // Debounced save to database
  const [debouncedExplanation] = useDebounce(explanation, 800);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    flushSave: async () => {
      if (pendingExplanation !== null) {
        console.log(`🚀 Force flushing explanation for Q${questionId}: "${pendingExplanation}"`);
        await saveExplanationToDatabase(pendingExplanation);
        setPendingExplanation(null);
      }
    },
    isSaving: () => isSaving || pendingExplanation !== null
  }));

  // Direct save function
  const saveExplanationToDatabase = useCallback(async (explanationText: string) => {
    setIsSaving(true);
    onSavingChange?.(true);
    
    try {
      const { error } = await supabase
        .from('atad2_answers')
        .update({ explanation: explanationText })
        .eq('session_id', sessionId)
        .eq('question_id', questionId);

      if (error) throw error;
      
      console.log(`💾 Saved explanation for Q${questionId}: "${explanationText}"`);
      
    } catch (error) {
      console.error('Error saving explanation:', error);
      throw error; // Re-throw for caller handling
    } finally {
      setIsSaving(false);
      onSavingChange?.(false);
    }
  }, [sessionId, questionId, onSavingChange]);

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
      if (isLoading || debouncedExplanation === undefined) return;
      
      // Mark as pending until saved
      setPendingExplanation(debouncedExplanation);
      
      try {
        await saveExplanationToDatabase(debouncedExplanation);
        setPendingExplanation(null); // Clear pending after successful save
      } catch (error) {
        // Keep as pending on error - will be retried on next change
        console.error('Failed to save explanation, keeping as pending:', error);
      }
    };

    saveExplanation();
  }, [debouncedExplanation, isLoading, saveExplanationToDatabase]);

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

  const isCurrentlySaving = isSaving || pendingExplanation !== null;

  return (
    <div className="space-y-2">
      <Textarea
        value={explanation}
        onChange={handleChange}
        placeholder={placeholder}
        className={`min-h-[100px] ${className}`}
        disabled={isSaving}
      />
      {isCurrentlySaving && (
        <div className="text-xs text-muted-foreground flex items-center gap-1">
          <div className="w-3 h-3 border border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          Saving explanation...
        </div>
      )}
    </div>
  );
});