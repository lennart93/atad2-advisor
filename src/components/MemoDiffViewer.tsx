import React, { useMemo } from "react";
import DOMPurify from "dompurify";
import { Button } from "@/components/ds/button";
import { Check, X } from "lucide-react";
import { generateDiffHtml } from "@/utils/textDiff";

interface MemoDiffViewerProps {
  originalMemo: string;
  revisedMemo: string;
  onAccept: () => void;
  onReject: () => void;
}

const MemoDiffViewer: React.FC<MemoDiffViewerProps> = ({
  originalMemo,
  revisedMemo,
  onAccept,
  onReject,
}) => {
  const diffHtml = useMemo(() => {
    const rawHtml = generateDiffHtml(originalMemo, revisedMemo);
    return DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: ['span', 'br', 'strong'],
      ALLOWED_ATTR: ['style'],
    });
  }, [originalMemo, revisedMemo]);

  return (
    <div className="space-y-4">
      {/* Header with legend */}
      <div className="flex items-center gap-4 text-sm pb-3 border-b border-border">
        <span className="text-ds-ink-tertiary line-through">Removed</span>
        <span className="text-ds-ink italic">Added</span>
      </div>

      {/* Diff content */}
      <div className="bg-muted/20 rounded-lg p-4 max-h-[60vh] overflow-y-auto">
        <div
          className="prose prose-sm max-w-none dark:prose-invert text-justify leading-relaxed"
          dangerouslySetInnerHTML={{ __html: diffHtml }}
        />
      </div>

      {/* Action buttons */}
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button variant="secondary" onClick={onReject}>
          <X className="h-4 w-4 mr-2" />
          Reject changes
        </Button>
        <Button variant="primary" onClick={onAccept}>
          <Check className="h-4 w-4 mr-2" />
          Accept changes
        </Button>
      </div>
    </div>
  );
};

export default MemoDiffViewer;
