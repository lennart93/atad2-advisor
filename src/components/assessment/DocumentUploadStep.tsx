// src/components/assessment/DocumentUploadStep.tsx
import { Card } from '@/components/ui/card';
import { DocumentUploader } from '@/components/prefill/DocumentUploader';

export function DocumentUploadStep({
  sessionId,
  locked,
}: {
  sessionId: string;
  locked: boolean;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">Supporting documents</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Optional. Documents are processed only for pre-fill extraction — not used
          for AI training. You can delete them anytime, and they are removed
          automatically after the report is generated.
        </p>
      </div>
      {!locked && (
        <Card className="bg-muted/40 p-4 text-sm text-muted-foreground">
          Supported: PDF, images (PNG/JPG/WEBP), Word (.docx), PowerPoint (.pptx),
          Excel (.xlsx), text/CSV/Markdown. Max 32 MB per file, 200 MB per session.
        </Card>
      )}
      <DocumentUploader sessionId={sessionId} locked={locked} />
    </div>
  );
}
