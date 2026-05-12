// src/components/structure/AtlasLoader.tsx
import { useEffect, useState } from 'react';
import { AnimatedLogo } from '@/components/AnimatedLogo';
import { Button } from '@/components/ui/button';
import type { ChartStatus } from '@/lib/structure/types';

interface Props {
  status: ChartStatus | 'loading';
  /** From atad2_structure_charts.warnings — used to mark a stage as failed */
  warnings?: Array<{ stage: number; message: string }>;
  /** Optional richer detail; passed when the parent has counts */
  detail?: { entitiesFound?: number; etaSeconds?: number };
  /** Callback to skip ahead and mark the chart draft_ready with what we have. */
  onSkipRemaining?: () => void;
  /** Optional callback for resuming Phase B from a phase_a_ready chart. */
  onResumeFromPhaseA?: () => void;
}

type Stage = 0 | 1 | 2 | 3 | 4;

export function stageOf(status: ChartStatus | 'loading'): Stage {
  if (status === 'loading' || status === 'extracting:stage1') return 1;
  if (status === 'extracting:stage2') return 2;
  if (status === 'phase_a_ready') return 3; // entities + ownership done, transactions next
  if (status === 'extracting:refining') return 2; // refining entities/ownership
  if (status === 'extracting:stage3') return 3;
  if (status === 'draft_ready' || status === 'user_edited' || status === 'finalized') return 4;
  return 0; // unknown / extraction_failed
}

interface RowProps {
  done?: boolean;
  active?: boolean;
  failed?: boolean;
  label: string;
  detail?: string;
}

function StageRow({ done, active, failed, label, detail }: RowProps) {
  const icon = failed ? '✗' : done ? '✓' : active ? '●' : '○';
  const iconColor = failed
    ? 'text-red-600'
    : done
    ? 'text-emerald-600'
    : active
    ? 'text-amber-600 animate-pulse'
    : 'text-neutral-300';
  const labelColor = active
    ? 'font-semibold text-neutral-900'
    : done
    ? ''
    : failed
    ? 'text-neutral-500'
    : 'text-neutral-400';
  return (
    <li className="flex items-start gap-2.5">
      <span className={`font-bold w-4 flex-shrink-0 ${iconColor}`}>{icon}</span>
      <div>
        <div className={labelColor}>{label}</div>
        {detail && <div className="text-xs text-neutral-400 mt-0.5">{detail}</div>}
      </div>
    </li>
  );
}

/** Show the "Continue without transactions" escape hatch after stage 3 has been
 *  spinning for this long. Stage 3 (transactions) is the most failure-prone
 *  and least essential — entities + ownership are usually sufficient. */
const STAGE3_ESCAPE_HATCH_MS = 30_000;

export function AtlasLoader({ status, warnings = [], detail, onSkipRemaining, onResumeFromPhaseA }: Props) {
  const stage = stageOf(status);
  const hasFailedStage = (n: number) => warnings.some((w) => w.stage === n);

  // Show the escape hatch only after we've been on stage 3 for STAGE3_ESCAPE_HATCH_MS.
  const [showSkip, setShowSkip] = useState(false);
  useEffect(() => {
    if (stage !== 3 || !onSkipRemaining) {
      setShowSkip(false);
      return;
    }
    const id = window.setTimeout(() => setShowSkip(true), STAGE3_ESCAPE_HATCH_MS);
    return () => window.clearTimeout(id);
  }, [stage, onSkipRemaining]);

  return (
    <div className="flex flex-col items-center gap-4 py-12">
      <AnimatedLogo state="working" size={24} className="opacity-20" />
      <div className="text-sm font-bold tracking-tight text-neutral-900">
        Preparing your structure chart…
      </div>
      <ul className="space-y-1.5 text-sm text-neutral-600 min-w-80">
        <StageRow
          done={stage >= 1}
          active={stage === 0}
          label="Reading uploaded documents"
        />
        <StageRow
          done={stage >= 2}
          active={stage === 1}
          failed={hasFailedStage(1)}
          label="Extracting legal entities"
          detail={
            detail?.entitiesFound != null
              ? `${detail.entitiesFound} entities found`
              : undefined
          }
        />
        <StageRow
          done={stage >= 3}
          active={stage === 2}
          failed={hasFailedStage(2)}
          label="Mapping ownership relationships"
          detail={
            detail?.etaSeconds != null && stage === 2
              ? `about ${detail.etaSeconds} seconds remaining`
              : undefined
          }
        />
        <StageRow
          done={stage === 4}
          active={stage === 3}
          failed={hasFailedStage(3)}
          label="Analyzing transactions for ATAD2 mismatches"
        />
      </ul>
      {showSkip && onSkipRemaining && (
        <div className="mt-2 flex flex-col items-center gap-2">
          <p className="text-xs text-neutral-500 max-w-sm text-center">
            Transactions analysis is taking longer than usual. You can continue with
            entities and ownership only — add transactions manually later.
          </p>
          <Button size="sm" variant="outline" onClick={onSkipRemaining}>
            Continue without transactions
          </Button>
        </div>
      )}
      {status === 'phase_a_ready' && onResumeFromPhaseA && (
        <div className="mt-2 flex flex-col items-center gap-2">
          <p className="text-xs text-neutral-500 max-w-sm text-center">
            Entities and ownership are ready. Generate transactions and ATAD2 mismatch analysis now.
          </p>
          <Button size="sm" onClick={onResumeFromPhaseA}>
            Generate transactions
          </Button>
        </div>
      )}
    </div>
  );
}
