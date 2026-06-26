// src/components/assessment/DocumentUploadStep.tsx
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
        <h2 className="text-[18px] font-medium tracking-tight text-ds-ink">Supporting documents</h2>
        <p className="mt-1 text-[13px] text-ds-ink-secondary">
          Documents are read to answer as much of the questionnaire as possible;
          whatever cannot be determined becomes a short list of points to confirm.
        </p>
      </div>
      {!locked && (
        <div className="rounded-ds-control bg-ds-fill-muted p-4 text-[13px] text-ds-ink-secondary">
          PDF, images (PNG/JPG/WEBP), Word (.docx, .rtf), PowerPoint (.pptx),
          Excel (.xlsx, .xlsm), text/CSV/Markdown. Max 15 MB per file, 100 MB per session.
        </div>
      )}
      <DocumentUploader sessionId={sessionId} locked={locked} />
    </div>
  );
}
