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
          Add the documents you already have. We read them to pre-fill as many
          answers as possible, then hand you a short list of anything left to confirm.
        </p>
      </div>
      {!locked && (
        <div className="border-t border-ds-hairline">
          <div className="flex gap-5 border-b border-ds-hairline py-3">
            <span className="w-20 shrink-0 pt-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ds-ink-secondary">
              Accepted
            </span>
            <span className="text-[13px] text-ds-ink">
              PDF, Word, PowerPoint, Excel, images, and text & Markdown files
            </span>
          </div>
          <div className="flex gap-5 border-b border-ds-hairline py-3">
            <span className="w-20 shrink-0 pt-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-ds-ink-secondary">
              Limits
            </span>
            <span className="text-[13px] text-ds-ink">15 MB per file · 100 MB per session</span>
          </div>
        </div>
      )}
      <DocumentUploader sessionId={sessionId} locked={locked} />
    </div>
  );
}
