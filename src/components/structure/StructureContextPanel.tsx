// src/components/structure/StructureContextPanel.tsx
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Check, X, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StructureContextPanelProps {
  sessionId: string;
  /** Warnings the extraction recorded — surfaced as "assumptions". */
  warnings: Array<{ stage: number; message: string }>;
  entityCount: number;
  taxpayerName: string | null;
}

export function StructureContextPanel({
  sessionId,
  warnings,
  entityCount,
  taxpayerName,
}: StructureContextPanelProps) {
  // NOTE: ordered by answered_at to match AssessmentReport's existing answers
  // query. answered_at is not perfectly consistent across all insert paths in
  // Assessment.tsx — accepted here because the report page already relies on
  // the same ordering; unifying answer ordering is out of scope for this plan.
  const { data: answers } = useQuery({
    queryKey: ['structure-context-answers', sessionId],
    enabled: !!sessionId,
    staleTime: 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from('atad2_answers')
        .select('question_id, question_text, answer')
        .eq('session_id', sessionId)
        .order('answered_at');
      return data ?? [];
    },
  });

  return (
    <aside
      data-snapshot-exclude="true"
      className="flex w-72 shrink-0 flex-col gap-4 overflow-y-auto border-l border-ds-hairline bg-ds-card p-4"
    >
      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-ds-ink-secondary">Taxpayer</p>
        <p className="mt-0.5 text-sm font-normal tracking-tight text-ds-ink">{taxpayerName ?? '-'}</p>
        <p className="mt-1 text-xs text-ds-ink-secondary">
          {entityCount} {entityCount === 1 ? 'entity' : 'entities'} in this structure
        </p>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-ds-ink-secondary">
          Answers behind this structure
        </p>
        <ul className="mt-2 space-y-1.5">
          {(answers ?? []).map((a) => (
            <li key={a.question_id} className="flex items-start gap-2 text-xs">
              <span className="mt-0.5 shrink-0">
                {a.answer === 'Yes' ? (
                  <Check className="h-3.5 w-3.5 text-ds-green" />
                ) : a.answer === 'No' ? (
                  <X className="h-3.5 w-3.5 text-ds-ink-tertiary" />
                ) : (
                  <HelpCircle className="h-3.5 w-3.5 text-ds-ink-tertiary" />
                )}
              </span>
              <span className="min-w-0">
                <span className="font-mono text-[10px] text-ds-ink-secondary">Q{a.question_id}</span>
                <span className="ml-1.5 text-ds-ink">{a.question_text}</span>
              </span>
            </li>
          ))}
          {(answers ?? []).length === 0 && (
            <li className="text-xs text-ds-ink-secondary">No answers recorded.</li>
          )}
        </ul>
      </div>

      <div>
        <p className="text-[10px] uppercase tracking-[0.18em] text-ds-ink-secondary">Assumptions</p>
        {warnings.length > 0 ? (
          <ul className="mt-2 space-y-1.5">
            {warnings.map((w, i) => (
              <li
                key={i}
                className={cn(
                  'rounded-md border border-ds-hairline bg-ds-amber-bg px-2 py-1.5 text-xs',
                  'text-ds-amber-text',
                )}
              >
                {w.message}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-ds-ink-secondary">
            No extraction assumptions were flagged.
          </p>
        )}
      </div>

      <p className="mt-auto text-[11px] leading-relaxed text-ds-ink-secondary">
        A snapshot is saved when you continue to the report.
      </p>
    </aside>
  );
}
