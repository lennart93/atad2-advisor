import { describe, it, expect } from 'vitest';
import { findOpaqueBounds } from '../autocropPng';

// Build an RGBA buffer of w*h transparent pixels with the given opaque spots.
function rgba(w: number, h: number, opaque: Array<[number, number]>): Uint8ClampedArray {
  const data = new Uint8ClampedArray(w * h * 4);
  for (const [x, y] of opaque) data[(y * w + x) * 4 + 3] = 255;
  return data;
}

describe('findOpaqueBounds', () => {
  it('returns the bounding box of the opaque pixels', () => {
    const data = rgba(10, 8, [[2, 1], [7, 5], [4, 3]]);
    expect(findOpaqueBounds(data, 10, 8)).toEqual({ left: 2, top: 1, right: 7, bottom: 5 });
  });

  it('returns null for a fully transparent image', () => {
    expect(findOpaqueBounds(rgba(6, 6, []), 6, 6)).toBeNull();
  });

  it('spans the whole image when opaque pixels touch every edge', () => {
    const data = rgba(5, 4, [[0, 0], [4, 3]]);
    expect(findOpaqueBounds(data, 5, 4)).toEqual({ left: 0, top: 0, right: 4, bottom: 3 });
  });

  it('ignores near-transparent anti-aliasing haze below the threshold', () => {
    const data = rgba(6, 6, [[3, 3]]);
    data[(0 * 6 + 0) * 4 + 3] = 4; // faint corner speck, under the default threshold of 8
    expect(findOpaqueBounds(data, 6, 6)).toEqual({ left: 3, top: 3, right: 3, bottom: 3 });
  });
});
