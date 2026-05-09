import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type Edge,
  type EdgeProps,
} from '@xyflow/react';
import { PALETTE } from '@/lib/structure/palette';
import type { TransactionType, MismatchClassification } from '@/lib/structure/types';

export interface TransactionEdgeData extends Record<string, unknown> {
  transaction_type: TransactionType;
  amount_eur: number | null;
  is_mismatch: boolean;
  mismatch_classification: MismatchClassification | null;
  mismatch_atad2_article: string | null;
  label: string | null;
}

export type TransactionEdgeType = Edge<TransactionEdgeData, 'transaction'>;

const TYPE_VERB: Record<TransactionType, string> = {
  loan: 'Loan',
  royalty: 'Royalty',
  dividend: 'Dividend',
  service_fee: 'Service fee',
  management_fee: 'Management fee',
  other: 'Transaction',
};

export function TransactionEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  id,
  data,
  markerEnd,
}: EdgeProps<TransactionEdgeType>) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    curvature: 0.4,
  });
  const stroke = data?.is_mismatch ? PALETTE.mismatchStroke : PALETTE.normalTransactionStroke;
  const verb = data ? TYPE_VERB[data.transaction_type] : 'Transaction';
  const amount =
    data?.amount_eur != null ? `${verb} EUR ${formatAmount(data.amount_eur)}` : verb;
  const subline =
    data?.is_mismatch && data.mismatch_classification
      ? `${data.mismatch_classification} mismatch${data.mismatch_atad2_article ? ' · art ' + data.mismatch_atad2_article : ''}`
      : null;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        style={{ stroke, strokeWidth: 2.2, fill: 'none' }}
        markerEnd={markerEnd}
      />
      <EdgeLabelRenderer>
        <div
          style={{
            position: 'absolute',
            transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
            background: '#fff',
            border: '0.75px solid rgba(0,0,0,0.16)',
            borderRadius: 2,
            padding: '4px 8px',
            fontFamily: 'Inter, system-ui, sans-serif',
            fontSize: 11.5,
            fontWeight: 700,
            color: stroke,
            textAlign: 'center',
            pointerEvents: 'all',
          }}
        >
          <div>{data?.label || amount}</div>
          {subline && <div style={{ fontSize: 10, marginTop: 1 }}>{subline}</div>}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}

function formatAmount(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(0)}k`;
  return amount.toLocaleString('en-US');
}
