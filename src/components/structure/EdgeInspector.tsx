import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import type { StructureEdge } from '@/lib/structure/types';

interface Props {
  edge: StructureEdge;
  onChange: (patch: Partial<StructureEdge>) => void;
  onDelete: () => void;
}

export function EdgeInspector({ edge, onChange, onDelete }: Props) {
  return (
    <div className="space-y-3">
      <div className="text-[10px] uppercase tracking-wide text-neutral-500 font-semibold">
        {edge.kind === 'ownership' ? 'Ownership' : 'Transaction'}
      </div>

      {edge.kind === 'ownership' ? (
        <>
          <div className="space-y-1">
            <Label htmlFor="pct">Ownership %</Label>
            <Input id="pct" type="number" min={0} max={100} step={0.01}
              value={edge.ownership_pct ?? ''}
              onChange={e => onChange({ ownership_pct: e.target.value === '' ? null : Number(e.target.value) })} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="voting_only" checked={Boolean(edge.ownership_voting_only)}
              onCheckedChange={c => onChange({ ownership_voting_only: Boolean(c) })} />
            <Label htmlFor="voting_only">Voting rights only</Label>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1">
            <Label htmlFor="ttype">Type</Label>
            <Select value={edge.transaction_type ?? 'other'}
              onValueChange={v => onChange({ transaction_type: v as StructureEdge['transaction_type'] })}>
              <SelectTrigger id="ttype"><SelectValue /></SelectTrigger>
              <SelectContent>
                {['loan','royalty','dividend','service_fee','management_fee','other'].map(t =>
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="amt">Amount (EUR)</Label>
            <Input id="amt" type="number" min={0} step="any"
              value={edge.amount_eur ?? ''}
              onChange={e => onChange({ amount_eur: e.target.value === '' ? null : Number(e.target.value) })} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="lbl">Label</Label>
            <Input id="lbl" value={edge.label ?? ''}
              onChange={e => onChange({ label: e.target.value || null })} />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="ismm" checked={edge.is_mismatch}
              onCheckedChange={c => onChange({ is_mismatch: Boolean(c) })} />
            <Label htmlFor="ismm">Hybrid mismatch (ATAD2)</Label>
          </div>
          {edge.is_mismatch && (
            <>
              <div className="space-y-1">
                <Label htmlFor="mc">Classification</Label>
                <Select value={edge.mismatch_classification ?? 'D/NI'}
                  onValueChange={v => onChange({ mismatch_classification: v as 'D/NI' | 'DD' })}>
                  <SelectTrigger id="mc"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="D/NI">D/NI — Deduction without inclusion</SelectItem>
                    <SelectItem value="DD">DD — Double deduction</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="art">ATAD2 article</Label>
                <Input id="art" placeholder="12aa"
                  value={edge.mismatch_atad2_article ?? ''}
                  onChange={e => onChange({ mismatch_atad2_article: e.target.value || null })} />
              </div>
            </>
          )}
        </>
      )}

      <Button variant="destructive" size="sm" onClick={onDelete} className="w-full">
        Delete
      </Button>
    </div>
  );
}
