// src/components/structure/exports/exportToPng.ts
import { toPng } from 'html-to-image';

/**
 * Capture the xyflow canvas as a PNG. The canvas root has the class
 * `react-flow` and contains a `.react-flow__viewport` for the actual graph content.
 */
export async function captureChartPng(opts: { rootSelector?: string; pixelRatio?: number } = {}): Promise<Blob> {
  const root = document.querySelector(opts.rootSelector ?? '.react-flow') as HTMLElement | null;
  if (!root) throw new Error('No react-flow root found in DOM');

  const dataUrl = await toPng(root, {
    pixelRatio: opts.pixelRatio ?? 3,
    cacheBust: true,
    backgroundColor: '#ffffff',
    filter: (node) => {
      // Don't capture the controls panel — we want a clean export
      return !(node instanceof HTMLElement && node.classList.contains('react-flow__controls'));
    },
  });
  const r = await fetch(dataUrl);
  return r.blob();
}
