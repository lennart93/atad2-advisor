import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
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
    return generateDiffHtml(originalMemo, revisedMemo);
  }, [originalMemo, revisedMemo]);

  return (
    <div className="space-y-4">
      {/* Header with legend */}
      <div className="flex items-center gap-4 text-sm pb-3 border-b border-border">
        <span className="text-red-600 line-through">Removed</span>
        <span className="text-[#003366] italic">Added</span>
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
        <Button
          variant="outline"
          onClick={onReject}
          className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
        >
          <X className="h-4 w-4 mr-2" />
          Reject changes
        </Button>
        <Button
          onClick={onAccept}
          className="bg-green-600 hover:bg-green-700 text-white"
        >
          <Check className="h-4 w-4 mr-2" />
          Accept changes
        </Button>
      </div>
    </div>
  );
};

export default MemoDiffViewer;
