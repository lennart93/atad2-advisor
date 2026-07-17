import { describe, expect, it } from "vitest";
import { computeBoundedDiff } from "@/lib/admin/boundedDiff";

/** Deterministic pseudo-random generator so the pathological inputs are stable. */
function rng(seed: number) {
  let s = seed;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
}

/** A long single-line text whose word-level diff against a sibling explodes. */
function pathologicalLine(seed: number, words: number): string {
  const r = rng(seed);
  const out: string[] = [];
  for (let i = 0; i < words; i++) {
    // Shared anchor words interleaved with unique ones fragment the LCS,
    // which is the worst case for Myers diff.
    out.push(i % 7 === 0 ? "common" : `w${Math.floor(r() * 99999)}`);
  }
  return out.join(" ");
}

/** Many lines that all differ, so line-level diff explodes too. */
function pathologicalLines(seed: number, lines: number): string {
  const r = rng(seed);
  const out: string[] = [];
  for (let i = 0; i < lines; i++) {
    out.push(i % 5 === 0 ? "shared line" : `line ${Math.floor(r() * 99999)} ${Math.floor(r() * 99999)}`);
  }
  return out.join("\n");
}

describe("computeBoundedDiff", () => {
  it("returns a word-level diff for ordinary inputs", () => {
    const parts = computeBoundedDiff("one two three", "one two four");
    expect(parts).not.toBeNull();
    expect(parts!.some((p) => p.added && p.value.includes("four"))).toBe(true);
    expect(parts!.some((p) => p.removed && p.value.includes("three"))).toBe(true);
  });

  it("falls back to a line-level diff when the word diff times out", () => {
    const a = pathologicalLine(7, 6000);
    const b = pathologicalLine(13, 6000);
    const parts = computeBoundedDiff(a, b, 50);
    // Single-line inputs: line diff is trivially fast, one removed + one added.
    expect(parts).not.toBeNull();
    expect(parts!.length).toBeLessThan(10);
  });

  it("returns null when both diffs time out, instead of blocking", () => {
    const a = pathologicalLine(7, 4000) + "\n" + pathologicalLines(21, 5000);
    const b = pathologicalLine(13, 4000) + "\n" + pathologicalLines(42, 5000);
    const started = Date.now();
    const parts = computeBoundedDiff(a, b, 50);
    expect(parts).toBeNull();
    // The whole point: it must give up quickly, not freeze for a minute.
    expect(Date.now() - started).toBeLessThan(5_000);
  });
});
