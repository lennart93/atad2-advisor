// src/components/structure/AtlasLoader.tsx
import { ProcessChecklist, type ProcessStep } from '@/components/ds';
import type { ChartStatus } from '@/lib/structure/types';
import { useUiBusySignal } from '@/stores/uiBusyStore';

type Stage = 0 | 1 | 2 | 3 | 4;

/** Exported for unit tests. Maps a ChartStatus to a numeric stage (0–4). */
export function stageOf(status: ChartStatus | 'loading'): Stage {
  if (status === 'loading' || status === 'extracting:stage1') return 1;
  if (status === 'extracting:stage2') return 2;
  if (status === 'extracting:refining') return 2;
  if (status === 'phase_a_ready') return 3;
  if (status === 'draft_ready' || status === 'user_edited' || status === 'finalized') return 4;
  return 0;
}

interface Props {
  status: ChartStatus | 'loading';
  /** From atad2_structure_charts.warnings — kept for call-site compatibility, unused. */
  warnings?: Array<{ stage: number; message: string }>;
  /** Kept for call-site compatibility, unused. */
  detail?: { entitiesFound?: number; etaSeconds?: number };
  /** Kept for call-site compatibility, unused. */
  onSkipRemaining?: () => void;
  /** Kept for call-site compatibility, unused. */
  onResumeFromPhaseA?: () => void;
}

export function AtlasLoader({ status }: Props) {
  // Top-left AppLayout logo spins while this loader is on screen; the
  // checklist's own row spinner is the only other motion.
  useUiBusySignal(true);
  const stage = stageOf(status);
  const steps: ProcessStep[] = [
    {
      id: 'reading',
      label: 'Reading documents',
      status: stage >= 2 ? 'done' : stage === 1 ? 'current' : 'pending',
    },
    {
      id: 'building',
      label: 'Building the chart',
      status: stage >= 3 ? 'done' : stage === 2 ? 'current' : 'pending',
    },
    {
      id: 'refining',
      label: 'Refining details',
      // At stage 3+ the parent unmounts this loader, so this row never needs
      // a spinner of its own; it simply stays pending until then.
      status: stage >= 4 ? 'done' : stage === 3 ? 'current' : 'pending',
    },
  ];
  return (
    <div className="text-sm text-muted-foreground text-center">
      <ProcessChecklist steps={steps} className="text-left" />
    </div>
  );
}
