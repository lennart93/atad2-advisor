import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import type { AppendixFacts } from '@/lib/appendix/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { addManualTransaction } from '@/lib/appendix/facts/transactionSet';

/**
 * The collapsed "Add transaction" control under section 3 (the transaction
 * counterpart of the register's "Add entity" form): pick the two parties, name
 * the flow type, and the new flow is created hand-added (`manual: true`) and
 * opened in the detail panel for its assessment.
 */
export function AddTransactionForm({ facts, onChange, onCreated }: {
  facts: AppendixFacts;
  onChange: (next: AppendixFacts) => void;
  onCreated: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [kind, setKind] = useState('');
  const reset = () => { setFromId(''); setToId(''); setKind(''); setOpen(false); };

  const canAdd = !!fromId && !!toId && fromId !== toId && kind.trim() !== '';

  const entityOption = (id: string) => {
    const e = facts.entities.find((x) => x.id === id);
    return e ? `${e.id} · ${e.name}` : id;
  };

  const partySelect = (value: string, onValue: (v: string) => void, label: string, excludeId: string) => (
    <Select value={value || undefined} onValueChange={onValue}>
      <SelectTrigger className="h-9 w-auto min-w-[200px] gap-3 border-border bg-card px-3 text-[14px] [&>span]:!flex" aria-label={label}>
        <SelectValue placeholder={label}>{value ? entityOption(value) : label}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {facts.entities.filter((e) => e.id !== excludeId).map((e) => (
          <SelectItem key={e.id} value={e.id}>{e.id} · {e.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-1.5 rounded-[4px] border border-border px-3 py-1.5 text-[12.5px] text-muted-foreground transition-colors hover:border-ds-ink-tertiary hover:text-foreground">
        <Plus className="h-3.5 w-3.5" /> Add transaction
      </button>
    );
  }

  return (
    <div className="rounded-md border border-border bg-[#fbfaf7] p-4">
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-[0.13em] text-muted-foreground">Add transaction</p>
        <button type="button" onClick={reset} aria-label="Close" className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2.5">
        {partySelect(fromId, setFromId, 'From entity', toId)}
        <span className="text-[13px] text-muted-foreground" aria-hidden>→</span>
        {partySelect(toId, setToId, 'To entity', fromId)}
        <input
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          placeholder="Type, e.g. interest on intercompany loan"
          aria-label="Transaction type"
          className="h-9 w-[280px] rounded-md border border-border bg-card px-3 text-[14px] text-foreground outline-none placeholder:text-muted-foreground/60"
        />
        <button
          type="button"
          disabled={!canAdd}
          onClick={() => {
            const { facts: next, id } = addManualTransaction(facts, { fromEntityId: fromId, toEntityId: toId, kind });
            onChange(next);
            reset();
            onCreated(id);
          }}
          className="inline-flex items-center gap-1.5 rounded-[4px] bg-foreground px-3 py-2 text-[13px] font-medium text-white transition-colors hover:bg-foreground/90 disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" /> Add
        </button>
      </div>
    </div>
  );
}
