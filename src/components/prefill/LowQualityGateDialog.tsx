import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
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
  const haveLabels = currentCategories.map((c) => LABEL_BY_VALUE[c].toLowerCase()).join(', ');
  const suggestions = missingTypes
    .slice(0, 2)
    .map((c) => LABEL_BY_VALUE[c].toLowerCase())
    .join(' or ');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEmpty ? 'Run pre-fill without documents?' : 'Solid start — want to add more?'}
          </DialogTitle>
          <DialogDescription>
            {isEmpty
              ? "Pre-fill works best when there's something to ground it in. Without documents, suggestions will be based purely on the answers you've already given."
              : `You've added ${haveLabels}. The pre-fill will work, but tends to be much sharper with at least one more type${suggestions ? ` — ${suggestions}` : ''}.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {isEmpty ? 'Cancel — add documents' : 'Add more documents'}
          </Button>
          <Button onClick={onConfirm}>
            {isEmpty ? 'Continue without' : 'Run pre-fill anyway'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
