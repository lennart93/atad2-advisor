// src/components/assessment/AssessmentFooterSlot.tsx
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { FooterBarGrid } from '@/components/ds';
import { useAssessmentShell } from './AssessmentShellContext';

/**
 * Renders `left` / `center` / `right` nodes into the shell's FooterBar via a
 * portal. The ds FooterBarGrid provides the three equal-width columns (each
 * cell self-aligned start / center / end), so pages that pass only
 * left+right keep behaving like the old justify-between layout and every
 * step's footer is identical.
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
    <FooterBarGrid left={left} center={center} right={right} />,
    footerEl,
  );
}
