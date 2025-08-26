import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Textarea } from '@/components/ui/textarea';
import { seededIndex } from '@/utils/random';

// Feature flag - can be easily disabled
const FORCE_CONTEXT_PANEL = true;

interface ContextPanelFallbackProps {
  sessionId: string;
  questionId: string;
  selectedAnswer: string;
  requiresExplanation: boolean;
}

export const ContextPanelFallback = ({
  sessionId,
  questionId,
  selectedAnswer,
  requiresExplanation
}: ContextPanelFallbackProps) => {
  const [suggestion, setSuggestion] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadContextSuggestion = async () => {
      setLoading(true);
      try {
        console.debug('[ContextPanelFallback] Loading context for:', {
          questionId,
          selectedAnswer,
          requiresExplanation
        });

        const { data, error } = await supabase
          .from('atad2_context_questions')
          .select('context_question')
          .eq('question_id', questionId)
          .eq('answer_trigger', selectedAnswer);

        if (error) {
          console.error('[ContextPanelFallback] Query error:', error);
          setSuggestion('');
          return;
        }

        if (!data || data.length === 0) {
          console.debug('[ContextPanelFallback] No context questions found');
          setSuggestion('');
          return;
        }

        // Deterministic selection using seeded index
        const seed = `${sessionId}::${questionId}`;
        const selectedIndex = seededIndex(seed, data.length);
        const selectedSuggestion = data[selectedIndex]?.context_question || '';
        
        console.debug('[ContextPanelFallback] Selected suggestion:', {
          totalPrompts: data.length,
          selectedIndex,
          suggestion: selectedSuggestion
        });

        setSuggestion(selectedSuggestion);
      } catch (error) {
        console.error('[ContextPanelFallback] Error loading context:', error);
        setSuggestion('');
      } finally {
        setLoading(false);
      }
    };

    loadContextSuggestion();
  }, [sessionId, questionId, selectedAnswer]);

  // Guards after hooks to prevent React #310
  if (!FORCE_CONTEXT_PANEL) {
    return null;
  }

  // Guard: don't render without required data
  if (!selectedAnswer || !requiresExplanation) {
    return null;
  }

  if (loading) {
    return (
      <div className="space-y-3 p-4 border rounded-lg bg-card">
        <div className="flex items-center gap-2">
          <span className="text-lg">💬</span>
          <h3 className="font-semibold">Context</h3>
        </div>
        <div className="h-20 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 border rounded-lg bg-card">
      <div className="flex items-center gap-2">
        <span className="text-lg">💬</span>
        <h3 className="font-semibold">Context</h3>
      </div>
      <Textarea
        placeholder={suggestion || 'Provide context…'}
        className="min-h-[100px] resize-none"
        readOnly
      />
    </div>
  );
};