// src/components/structure/AtlasLoader.tsx
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

export function AtlasLoader(_props: Props) {
  // Top-left AppLayout logo spins while this loader is on screen, so we don't
  // render a second spinner here — just the textual status.
  useUiBusySignal(true);
  return (
    <div className="text-sm text-muted-foreground text-center">
      Loading chart…
    </div>
  );
}
