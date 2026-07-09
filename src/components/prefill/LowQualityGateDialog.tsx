import { Plus } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ds';
import { DOCUMENT_CATEGORIES, type DocumentCategory } from '@/lib/prefill/types';
import type { QualityTier } from '@/lib/prefill/qualityMeter';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tier: QualityTier;
  currentCategories: DocumentCategory[];
  missingTypes: DocumentCategory[];
  onConfirm: () => void;
}

const LABEL_BY_VALUE = Object.fromEntries(
  DOCUMENT_CATEGORIES.map((c) => [c.value, c.label]),
) as Record<DocumentCategory, string>;

export function LowQualityGateDialog({
  open,
  onOpenChange,
  tier,
  currentCategories,
  missingTypes,
  onConfirm,
}: Props) {
  const isEmpty = tier === 'empty';
  const suggestions = missingTypes
    .slice(0, 2)
    .map((c) => LABEL_BY_VALUE[c].toLowerCase())
    .join(' or ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-sm border-t-[3px] border-t-brand-terracotta bg-card">
        <DialogHeader>
          <DialogTitle className="font-normal">
            {isEmpty ? 'Continue without documents?' : 'Add another document?'}
          </DialogTitle>
          <DialogDescription>
            {isEmpty
              ? 'Without documents there is nothing to read, so every question is answered by hand.'
              : `One more document type tends to sharpen the answers${suggestions ? `, for example ${suggestions}.` : '.'}`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="secondary" onClick={onConfirm}>
            {isEmpty ? 'Continue without' : 'Continue anyway'}
          </Button>
          <Button variant="primary" onClick={() => onOpenChange(false)}>
            {isEmpty ? 'Add documents' : 'Add a document'}
            <Plus />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
