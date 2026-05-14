import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';
import type { TransactionBundle } from '@/lib/structure/bundleTransactions';
import type { StructureEntity } from '@/lib/structure/types';
import { PALETTE } from '@/lib/structure/palette';

interface Props {
  bundle: TransactionBundle;
  entities: StructureEntity[];
  x: number;
  y: number;
  onClose: () => void;
  onSelectTransaction: (txnId: string) => void;
}

function formatAmount(n: number | null): string {
  if (n == null) return '—';
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}k`;
  return n.toString();
}

export function TransactionBundlePopover({
  bundle, entities, x, y, onClose, onSelectTransaction,
}: Props) {
  const fromName = entities.find((e) => e.id === bundle.from_entity_id)?.name ?? bundle.from_entity_id;
  const toName = entities.find((e) => e.id === bundle.to_entity_id)?.name ?? bundle.to_entity_id;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        transform: 'translate(-50%, 8px)',
        zIndex: 50,
        width: 280,
        background: '#fff',
        border: '1px solid rgba(0,0,0,0.16)',
        borderRadius: 4,
        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
        pointerEvents: 'all',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid rgba(0,0,0,0.08)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}>
        <div style={{ fontSize: 12, fontWeight: 600 }}>
          {fromName} → {toName}
        </div>
        <Button size="sm" variant="ghost" onClick={onClose} style={{ height: 24, width: 24, padding: 0 }}>
          <X className="w-3 h-3" />
        </Button>
      </div>
      <div style={{ padding: '4px 12px 8px', fontSize: 11, color: '#666' }}>
        {bundle.transactions.length} transaction{bundle.transactions.length === 1 ? '' : 's'}
        {bundle.totalAmount != null ? ` · €${formatAmount(bundle.totalAmount)} total` : ''}
      </div>
      <div>
        {bundle.transactions.map((t) => (
          <button
            key={t.id}
            onClick={() => onSelectTransaction(t.id)}
            style={{
              width: '100%',
              textAlign: 'left',
              padding: '6px 12px',
              fontSize: 12,
              background: 'none',
              border: 'none',
              borderTop: '1px solid rgba(0,0,0,0.06)',
              cursor: 'pointer',
              display: 'grid',
              gridTemplateColumns: '90px 70px 1fr',
              gap: 8,
            }}
            className="hover:bg-neutral-50"
          >
            <span style={{ textTransform: 'capitalize' }}>{t.transaction_type ?? 'other'}</span>
            <span style={{ color: '#1f5489' }}>€{formatAmount(t.amount_eur)}</span>
            <span style={{ color: t.is_mismatch ? PALETTE.mismatchStroke : '#666' }}>
              {t.is_mismatch
                ? `${t.mismatch_classification ?? 'mismatch'}${t.mismatch_atad2_article ? ' · art ' + t.mismatch_atad2_article : ''}`
                : ''}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
