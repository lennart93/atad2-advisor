import { describe, it, expect } from "vitest";
import { parseStoredWidth } from "../useResizablePanelWidth";

describe("parseStoredWidth", () => {
  const MIN = 360;
  const MAX = 900;
  const FALLBACK = 480;

  it("returns the fallback when nothing is stored", () => {
    expect(parseStoredWidth(null, FALLBACK, MIN, MAX)).toBe(FALLBACK);
  });

  it("returns the fallback for a non-numeric value", () => {
    expect(parseStoredWidth("wide", FALLBACK, MIN, MAX)).toBe(FALLBACK);
  });

  it("parses a stored numeric width", () => {
    expect(parseStoredWidth("600", FALLBACK, MIN, MAX)).toBe(600);
  });

  it("clamps below the minimum and above the maximum", () => {
    expect(parseStoredWidth("100", FALLBACK, MIN, MAX)).toBe(MIN);
    expect(parseStoredWidth("5000", FALLBACK, MIN, MAX)).toBe(MAX);
  });
});
