// src/components/assessment/AssessmentFooterSlot.tsx
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useAssessmentShell } from './AssessmentShellContext';

/**
 * Renders `left` / `right` nodes into the shell's footer via a portal.
 * Pages just render <AssessmentFooterSlot left={...} right={...} /> — React
 * handles updates normally; no config registration, no memoisation, no
 * stale-closure risk. Renders nothing until the shell footer node exists
 * (one frame on first paint; the footer has min-height so it doesn't jump).
 */
export function AssessmentFooterSlot({
  left,
  right,
}: {
  left?: ReactNode;
  right?: ReactNode;
}) {
  const { footerEl } = useAssessmentShell();
  if (!footerEl) return null;
  return createPortal(
    <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
      <div>{left}</div>
      <div>{right}</div>
    </div>,
    footerEl,
  );
}
