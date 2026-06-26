// src/lib/structure/viewportFraming.ts
//
// Framing math for the structure chart camera. The taxpayer is the subject of
// the assessment, so it should sit in the horizontal centre of the pane,
// regardless of where it lands inside the ownership tree (it is rarely the UPE,
// so a plain bounding-box fit drifts it off to one side). We still keep every
// entity visible: the zoom is chosen so the wider half (taxpayer→left edge vs
// taxpayer→right edge) fits within half the pane.

export interface ViewportTransform {
  x: number;
  y: number;
  zoom: number;
}

export interface ChartBounds {
  /** Left edge (chart coords, top-left origin). */
  minX: number;
  /** Right edge. */
  maxX: number;
  /** Top edge. */
  minY: number;
  /** Bottom edge. */
  maxY: number;
}

/**
 * Compute a viewport transform (pan + zoom) that keeps the taxpayer horizontally
 * centred in the pane while framing the whole chart. The tree is centred
 * vertically on its own mid-line. Everything stays visible because the zoom
 * accounts for the wider side measured from the taxpayer.
 */
export function taxpayerCenteredViewport(args: {
  bounds: ChartBounds;
  /** Chart-coord x of the taxpayer's horizontal centre. */
  taxpayerCenterX: number;
  viewportWidth: number;
  viewportHeight: number;
  /** Fraction of the pane reserved as margin on each axis. Default 0.12. */
  padding?: number;
  minZoom?: number;
  maxZoom?: number;
}): ViewportTransform {
  const { bounds, taxpayerCenterX, viewportWidth, viewportHeight } = args;
  const padding = args.padding ?? 0.12;
  const minZoom = args.minZoom ?? 0.3;
  const maxZoom = args.maxZoom ?? 1.0;

  // Half-width needed so both edges fit with the taxpayer dead-centre.
  const halfW = Math.max(
    taxpayerCenterX - bounds.minX,
    bounds.maxX - taxpayerCenterX,
    1,
  );
  const neededW = 2 * halfW;
  const neededH = Math.max(bounds.maxY - bounds.minY, 1);

  const availW = Math.max(viewportWidth, 1) * (1 - padding);
  const availH = Math.max(viewportHeight, 1) * (1 - padding);

  let zoom = Math.min(availW / neededW, availH / neededH);
  if (!Number.isFinite(zoom) || zoom <= 0) zoom = minZoom;
  zoom = Math.max(minZoom, Math.min(maxZoom, zoom));

  const bboxCenterY = (bounds.minY + bounds.maxY) / 2;
  // screenX = chartX * zoom + x  →  taxpayerCenterX must map to viewportWidth/2.
  const x = viewportWidth / 2 - taxpayerCenterX * zoom;
  const y = viewportHeight / 2 - bboxCenterY * zoom;
  return { x, y, zoom };
}
