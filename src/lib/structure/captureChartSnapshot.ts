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
 * maxWidth/maxHeight so a huge chart doesn't produce a multi-MB PNG, and floors
 * the canvas to minWidth/minHeight so a tiny chart (e.g. a single entity) isn't
 * cropped tight to its own box and then upscaled to fill the display — a small
 * chart should sit at its natural size with breathing room, like it does on the
 * editor canvas, not balloon to fill the frame.
 */
export function computeSnapshotViewport(
  bounds: Rect,
  opts: { padding: number; maxWidth: number; maxHeight: number; minWidth?: number; minHeight?: number },
): SnapshotViewport {
  const padX = bounds.width * opts.padding;
  const padY = bounds.height * opts.padding;
  let width = Math.max(1, bounds.width + padX * 2);
  let height = Math.max(1, bounds.height + padY * 2);

  // Floor the canvas BEFORE clamping so small charts gain surrounding whitespace
  // instead of a tight crop. For content already larger than the floor this is a
  // no-op and the tight 10%-padded crop is preserved.
  if (opts.minWidth) width = Math.max(width, opts.minWidth);
  if (opts.minHeight) height = Math.max(height, opts.minHeight);

  const scale = Math.min(1, opts.maxWidth / width, opts.maxHeight / height);
  width = Math.round(width * scale);
  height = Math.round(height * scale);

  const { x, y, zoom } = getViewportForBounds(
    bounds,
    width,
    height,
    0.1, // minZoom
    1,   // maxZoom — never magnify; a small chart stays at natural size, centered
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
      // Hug the entities: barely any framing whitespace. The memo places the
      // image at content width, so every padded pixel reads as dead margin
      // around the chart there (and the memo build autocrops the transparent
      // border anyway, see autocropPng.ts).
      padding: 0.02,
      maxWidth: 2400,
      maxHeight: 2400,
      // Minimum canvas so a one- or two-entity chart renders at its natural
      // editor size with margin around it, rather than a tight box that the
      // Overview/memo then blow up to fill the available height.
      minWidth: 600,
      minHeight: 400,
    });
    // Target a ~2300px-wide raster (clamped to 2-4x) so the chart embeds well above
    // 200 dpi at its placed size, regardless of how large the chart is on screen.
    // The old default device ratio produced a soft ~89 dpi bitmap in the memo.
    const pixelRatio = Math.min(4, Math.max(2, 2300 / Math.max(vp.width, 1)));
    const dataUrl = await toPng(viewportEl, {
      backgroundColor: undefined, // transparent
      cacheBust: true,
      pixelRatio,
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
