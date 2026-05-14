// src/lib/structure/captureChartSnapshot.ts
import { toPng } from 'html-to-image';
import { getNodesBounds, getViewportForBounds, type Node, type Rect } from '@xyflow/react';

/**
 * A real 2x chart capture is large. A blank capture of an empty viewport can
 * still be a few KB, so the guard must be well above "tiny" — 5000 chars of
 * base64 (~3.6 KB) is comfortably below any real chart and above a blank one.
 */
const MIN_DATA_URL_LENGTH = 5000;

export function isUsablePngDataUrl(value: string | null): value is string {
  if (!value) return false;
  if (!value.startsWith('data:image/png;base64,')) return false;
  return value.length >= MIN_DATA_URL_LENGTH;
}

export interface SnapshotViewport {
  width: number;
  height: number;
  transform: { x: number; y: number; zoom: number };
}

/**
 * Pure: given the bounding box of all nodes, compute the image dimensions and
 * the viewport transform that frames the whole chart with padding. Clamps to
 * maxWidth/maxHeight so a huge chart doesn't produce a multi-MB PNG.
 */
export function computeSnapshotViewport(
  bounds: Rect,
  opts: { padding: number; maxWidth: number; maxHeight: number },
): SnapshotViewport {
  const padX = bounds.width * opts.padding;
  const padY = bounds.height * opts.padding;
  let width = Math.max(1, bounds.width + padX * 2);
  let height = Math.max(1, bounds.height + padY * 2);

  const scale = Math.min(1, opts.maxWidth / width, opts.maxHeight / height);
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const { x, y, zoom } = getViewportForBounds(
    bounds,
    width,
    height,
    0.1, // minZoom
    2,   // maxZoom
    opts.padding,
  );
  return { width, height, transform: { x, y, zoom } };
}

/**
 * Captures the whole chart as a transparent PNG data URL using ReactFlow's
 * documented bounds-based recipe. `nodes` comes from the ReactFlow instance;
 * `viewportEl` is the `.react-flow__viewport` DOM node. Returns null on failure
 * or a blank/trivial result — callers MUST handle null and never block the
 * user's flow on a failed snapshot.
 */
export async function captureChartSnapshot(
  viewportEl: HTMLElement | null,
  nodes: Node[],
): Promise<string | null> {
  if (!viewportEl || nodes.length === 0) return null;
  try {
    const bounds = getNodesBounds(nodes);
    const vp = computeSnapshotViewport(bounds, {
      padding: 0.1,
      maxWidth: 2400,
      maxHeight: 2400,
    });
    const dataUrl = await toPng(viewportEl, {
      backgroundColor: undefined, // transparent
      cacheBust: true,
      width: vp.width,
      height: vp.height,
      style: {
        width: `${vp.width}px`,
        height: `${vp.height}px`,
        transform: `translate(${vp.transform.x}px, ${vp.transform.y}px) scale(${vp.transform.zoom})`,
      },
      filter: (el) =>
        (el as HTMLElement).dataset?.snapshotExclude !== 'true',
    });
    return isUsablePngDataUrl(dataUrl) ? dataUrl : null;
  } catch (err) {
    console.warn('[captureChartSnapshot] capture failed', err);
    return null;
  }
}
