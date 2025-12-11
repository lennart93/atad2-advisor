import React, { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Check, X, Eye, EyeOff } from "lucide-react";
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
  const [showDiff, setShowDiff] = React.useState(true);

  const diffHtml = useMemo(() => {
    return generateDiffHtml(originalMemo, revisedMemo);
  }, [originalMemo, revisedMemo]);

  return (
    <div className="space-y-4">
      {/* Header with legend and toggle */}
      <div className="flex items-center justify-between flex-wrap gap-3 pb-3 border-b border-border">
        <div className="flex items-center gap-4 text-sm">
          <span className="font-medium text-muted-foreground">Legend:</span>
          <span className="flex items-center gap-1">
            <span className="text-red-600 line-through">Removed</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="text-[#003366] italic">Added</span>
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowDiff(!showDiff)}
        >
          {showDiff ? (
            <>
              <EyeOff className="h-4 w-4 mr-2" />
              Show final version
            </>
          ) : (
            <>
              <Eye className="h-4 w-4 mr-2" />
              Show track changes
            </>
          )}
        </Button>
      </div>

      {/* Diff content */}
      <div className="bg-muted/20 rounded-lg p-4 max-h-[60vh] overflow-y-auto">
        {showDiff ? (
          <div
            className="prose prose-sm max-w-none dark:prose-invert text-justify leading-relaxed"
            dangerouslySetInnerHTML={{ __html: diffHtml }}
          />
        ) : (
          <div className="prose prose-sm max-w-none dark:prose-invert text-justify leading-relaxed whitespace-pre-wrap">
            {revisedMemo}
          </div>
        )}
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
