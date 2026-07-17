// src/lib/structure/autocropPng.ts
//
// Trims the transparent border off a chart snapshot PNG so the image embedded
// in the Word memo hugs the entities instead of carrying the capture's framing
// whitespace. The stored snapshots have a transparent background, so the crop
// box is simply the bounding box of the non-transparent pixels; a snapshot
// without any transparent border (e.g. the white-background live-capture
// fallback) is left untouched.

export interface OpaqueBounds {
  left: number;
  top: number;
  right: number; // inclusive
  bottom: number; // inclusive
}

/**
 * Pure: the bounding box of all pixels whose alpha exceeds the threshold, or
 * null for a fully transparent image. `data` is RGBA, row-major (ImageData).
 */
export function findOpaqueBounds(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  alphaThreshold = 8,
): OpaqueBounds | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y++) {
    const rowStart = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[rowStart + x * 4 + 3] > alphaThreshold) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }
  return right < 0 ? null : { left, top, right, bottom };
}

export interface CroppedPng {
  base64: string; // without the data-url prefix
  width: number;
  height: number;
}

/**
 * Crop a base64 PNG (no data-url prefix) to its opaque content plus a small
 * margin. Returns null when there is nothing to gain: load/decode failure, a
 * fully transparent image, or no transparent border to trim (callers then keep
 * the original bytes). Browser-only (uses Image + canvas).
 */
export async function autocropPngBase64(base64: string, marginPx = 24): Promise<CroppedPng | null> {
  try {
    const img = new Image();
    const loaded = new Promise<void>((res, rej) => {
      img.onload = () => res();
      img.onerror = () => rej(new Error('png decode failed'));
    });
    img.src = `data:image/png;base64,${base64}`;
    await loaded;
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) return null;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0);
    const bounds = findOpaqueBounds(ctx.getImageData(0, 0, w, h).data, w, h);
    if (!bounds) return null;

    const left = Math.max(0, bounds.left - marginPx);
    const top = Math.max(0, bounds.top - marginPx);
    const right = Math.min(w - 1, bounds.right + marginPx);
    const bottom = Math.min(h - 1, bounds.bottom + marginPx);
    const cw = right - left + 1;
    const ch = bottom - top + 1;
    if (cw >= w && ch >= h) return null; // nothing to trim

    const out = document.createElement('canvas');
    out.width = cw;
    out.height = ch;
    const octx = out.getContext('2d');
    if (!octx) return null;
    octx.drawImage(canvas, left, top, cw, ch, 0, 0, cw, ch);
    const dataUrl = out.toDataURL('image/png');
    const prefix = 'data:image/png;base64,';
    if (!dataUrl.startsWith(prefix)) return null;
    return { base64: dataUrl.slice(prefix.length), width: cw, height: ch };
  } catch {
    return null;
  }
}
