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
        <h2 className="text-2xl font-normal tracking-tight text-ds-ink">Supporting documents</h2>
        <p className="mt-2 text-[15px] text-ds-ink-secondary">
          Add the documents you already have. They are read to pre-fill as many
          answers as possible, leaving a short list to confirm.
        </p>
      </div>
      {!locked && (
        <p className="text-[13px] text-ds-ink-secondary">
          PDF, Word, PowerPoint, Excel, images, and text and Markdown files. 15 MB per file, 100 MB per session.
        </p>
      )}
      <DocumentUploader sessionId={sessionId} locked={locked} />
    </div>
  );
}
