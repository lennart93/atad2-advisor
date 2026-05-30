// src/components/assessment/AssessmentFooterSlot.tsx
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { useAssessmentShell } from './AssessmentShellContext';

/**
 * Renders `left` / `center` / `right` nodes into the shell's footer via a
 * portal. Three equal-width columns, each cell self-aligned (start / center
 * / end), so pages that pass only left+right keep behaving like the old
 * justify-between layout.
 */
export function AssessmentFooterSlot({
  left,
  center,
  right,
}: {
  left?: ReactNode;
  center?: ReactNode;
  right?: ReactNode;
}) {
  const { footerEl } = useAssessmentShell();
  if (!footerEl) return null;
  return createPortal(
    <div className="mx-auto grid max-w-6xl grid-cols-3 items-center px-4 py-3">
      <div className="justify-self-start">{left}</div>
      <div className="justify-self-center">{center}</div>
      <div className="justify-self-end">{right}</div>
    </div>,
    footerEl,
  );
}
