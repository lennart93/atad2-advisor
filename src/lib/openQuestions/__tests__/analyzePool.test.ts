import { describe, it, expect } from "vitest";
import { ANALYZE_POOL_CONCURRENCY, runAnalyzePool } from "../analyzePool";

/** Real async boundary so parallel workers genuinely interleave. */
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

describe("runAnalyzePool", () => {
  it("processes every entry exactly once", async () => {
    const entries = Array.from({ length: 11 }, (_, i) => `q${i}`);
    const seen: string[] = [];
    await runAnalyzePool(entries, async (entry) => {
      await tick();
      seen.push(entry);
    });
    expect(seen).toHaveLength(entries.length);
    expect([...seen].sort()).toEqual([...entries].sort());
  });

  it("never exceeds the concurrency cap", async () => {
    const entries = Array.from({ length: 13 }, (_, i) => i);
    let inFlight = 0;
    let maxInFlight = 0;
    await runAnalyzePool(entries, async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Two yields so every worker is provably mid-flight at the same time.
      await tick();
      await tick();
      inFlight--;
    });
    expect(maxInFlight).toBeLessThanOrEqual(ANALYZE_POOL_CONCURRENCY);
    // Sanity: the pool really runs in parallel, not one by one.
    expect(maxInFlight).toBeGreaterThan(1);
  });

  it("caps the workers at entries.length when there are fewer entries than the cap", async () => {
    const entries = ["a", "b"];
    let inFlight = 0;
    let maxInFlight = 0;
    const seen: string[] = [];
    await runAnalyzePool(
      entries,
      async (entry) => {
        inFlight++;
        maxInFlight = Math.max(maxInFlight, inFlight);
        await tick();
        seen.push(entry);
        inFlight--;
      },
      100,
    );
    expect(maxInFlight).toBeLessThanOrEqual(entries.length);
    expect([...seen].sort()).toEqual(["a", "b"]);
  });

  it("keeps draining the queue when a work call rejects", async () => {
    // work() is expected to catch its own errors; this guards the contract
    // that even an uncaught rejection only stops its own worker while the
    // remaining workers drain the rest of the queue (Promise.allSettled).
    const entries = ["a", "boom", "b", "c", "d", "e", "f"];
    const done: string[] = [];
    await runAnalyzePool(entries, async (entry) => {
      await tick();
      if (entry === "boom") throw new Error("boom");
      done.push(entry);
    });
    expect([...done].sort()).toEqual(["a", "b", "c", "d", "e", "f"]);
  });

  it("resolves immediately for an empty entries array", async () => {
    let calls = 0;
    await runAnalyzePool([], async () => {
      calls++;
    });
    expect(calls).toBe(0);
  });
});
