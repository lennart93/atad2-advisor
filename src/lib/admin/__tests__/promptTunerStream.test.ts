import { describe, expect, it } from "vitest";
import { parseAnalyzeResponseText } from "@/lib/admin/promptTunerStream";

const ANALYSIS = {
  summary_of_changes: "Tightened hedging.",
  changes: [{ what: "x", inferred_intent: "y", prompt_gap: "z" }],
  prompt_weaknesses: ["too loose"],
  proposed_revised_system_prompt: "You are...",
  suggested_notes: "note",
};

describe("parseAnalyzeResponseText", () => {
  it("returns the final payload from a heartbeat stream", () => {
    const body =
      '{"heartbeat":true}\n{"heartbeat":true}\n' +
      JSON.stringify({ analysis: ANALYSIS, target_prompt_version: 7, target_prompt_key: "memo_system" }) +
      "\n";
    const payload = parseAnalyzeResponseText(body);
    expect(payload.analysis).toEqual(ANALYSIS);
  });

  it("returns the error payload when the stream ends in an error line", () => {
    const body = '{"heartbeat":true}\n' + JSON.stringify({ error: "Anthropic response contained no text block" }) + "\n";
    const payload = parseAnalyzeResponseText(body);
    expect(payload.error).toContain("no text block");
  });

  it("still understands the plain JSON body of the currently deployed function", () => {
    const body = JSON.stringify({ analysis: ANALYSIS, target_prompt_version: 6, target_prompt_key: "memo_system" });
    const payload = parseAnalyzeResponseText(body);
    expect(payload.analysis).toEqual(ANALYSIS);
  });

  it("ignores trailing heartbeats after the payload", () => {
    const body =
      JSON.stringify({ analysis: ANALYSIS }) + '\n{"heartbeat":true}\n';
    const payload = parseAnalyzeResponseText(body);
    expect(payload.analysis).toEqual(ANALYSIS);
  });

  it("throws a readable error when no payload line is present", () => {
    expect(() => parseAnalyzeResponseText('{"heartbeat":true}\n{"heartbeat":true}\n')).toThrow(/no result/i);
    expect(() => parseAnalyzeResponseText("")).toThrow(/no result/i);
    expect(() => parseAnalyzeResponseText("<html>504 Gateway Timeout</html>")).toThrow(/no result/i);
  });
});
