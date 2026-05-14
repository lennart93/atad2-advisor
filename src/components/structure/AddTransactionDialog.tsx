import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { StructureEntity, TransactionType, MismatchClassification } from '@/lib/structure/types';

const TRANSACTION_TYPES: ReadonlyArray<{ key: TransactionType; label: string }> = [
  { key: 'loan', label: 'Loan' },
  { key: 'royalty', label: 'Royalty' },
  { key: 'dividend', label: 'Dividend' },
  { key: 'service_fee', label: 'Service fee' },
  { key: 'management_fee', label: 'Management fee' },
  { key: 'other', label: 'Other' },
];

const MISMATCH_CLASSIFICATIONS: ReadonlyArray<{ key: MismatchClassification; label: string }> = [
  { key: 'D/NI', label: 'D/NI' },
  { key: 'DD', label: 'DD' },
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entities: StructureEntity[];
  taxpayerId: string | null;
  onCreate: (payload: {
    from_entity_id: string;
    to_entity_id: string;
    transaction_type: TransactionType;
    amount_eur: number | null;
    is_mismatch: boolean;
    mismatch_classification: MismatchClassification | null;
    mismatch_atad2_article: string | null;
  }) => Promise<void>;
}

export function AddTransactionDialog({ open, onOpenChange, entities, taxpayerId, onCreate }: Props) {
  const defaultFrom = taxpayerId ?? entities[0]?.id ?? '';
  const defaultTo = entities.find((e) => e.id !== defaultFrom)?.id ?? entities[0]?.id ?? '';

  const [fromId, setFromId] = useState(defaultFrom);
  const [toId, setToId] = useState(defaultTo);
  const [type, setType] = useState<TransactionType>('loan');
  const [amount, setAmount] = useState<string>('');
  const [isMismatch, setIsMismatch] = useState(false);
  const [classification, setClassification] = useState<MismatchClassification>('D/NI');
  const [article, setArticle] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setFromId(defaultFrom);
      setToId(defaultTo);
      setType('loan');
      setAmount('');
      setIsMismatch(false);
      setClassification('D/NI');
      setArticle('');
    }
  }, [open, defaultFrom, defaultTo]);

  const handleSubmit = async () => {
    if (!fromId || !toId || fromId === toId) return;
    setBusy(true);
    try {
      const amountNum = amount.trim() === '' ? null : Number(amount);
      await onCreate({
        from_entity_id: fromId,
        to_entity_id: toId,
        transaction_type: type,
        amount_eur: Number.isFinite(amountNum) ? amountNum : null,
        is_mismatch: isMismatch,
        mismatch_classification: isMismatch ? classification : null,
        mismatch_atad2_article: isMismatch && article.trim() !== '' ? article.trim() : null,
      });
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add transaction</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="txn-from">From entity</Label>
            <Select value={fromId} onValueChange={setFromId}>
              <SelectTrigger id="txn-from"><SelectValue /></SelectTrigger>
              <SelectContent>
                {entities.map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="txn-to">To entity</Label>
            <Select value={toId} onValueChange={setToId}>
              <SelectTrigger id="txn-to"><SelectValue /></SelectTrigger>
              <SelectContent>
                {entities.filter((e) => e.id !== fromId).map((e) => (
                  <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="txn-type">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as TransactionType)}>
              <SelectTrigger id="txn-type"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TRANSACTION_TYPES.map((t) => (
                  <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="txn-amount">Amount (EUR)</Label>
            <Input
              id="txn-amount"
              type="number"
              placeholder="Optional"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox id="txn-mismatch" checked={isMismatch} onCheckedChange={(v) => setIsMismatch(Boolean(v))} />
            <Label htmlFor="txn-mismatch">Mismatch</Label>
          </div>
          {isMismatch && (
            <>
              <div>
                <Label htmlFor="txn-classification">Mismatch classification</Label>
                <Select value={classification} onValueChange={(v) => setClassification(v as MismatchClassification)}>
                  <SelectTrigger id="txn-classification"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {MISMATCH_CLASSIFICATIONS.map((c) => (
                      <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="txn-article">ATAD2 article (optional)</Label>
                <Input
                  id="txn-article"
                  placeholder="e.g. 12aa"
                  value={article}
                  onChange={(e) => setArticle(e.target.value)}
                />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={busy || !fromId || !toId || fromId === toId}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
