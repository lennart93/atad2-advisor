// Fable 5 client for the holistic appendix review pass.
//
// Isolated from reviewAppendix.ts (which stays pure and unit-testable) because
// this file touches Deno.env and the network. The Anthropic SDK is imported via
// the bare specifier "anthropic" (resolved through this function's deno.json
// import map, like claude.ts), not a full URL.
//
// Required environment:
//   - ANTHROPIC_API_KEY  the same key the swarm uses on this project. When absent,
//                         the caller skips the review pass.

import Anthropic from "anthropic";

// Fable 5: the editorial / style model. The holistic pass is a language task
// (tighten, de-duplicate, straighten), not a reasoning task, so this tier fits and
// is cheaper/faster than the Sonnet swarm.
export const FABLE_MODEL = "claude-fable-5";

// The appendix reasoning is a few thousand tokens; the cap is a safety ceiling,
// not a target. The length-band guard in reviewAppendix.ts catches truncation.
const MAX_TOKENS = 16384;

// NB: the Claude 5 family (Fable 5) rejects the `temperature` parameter, so we do
// not send one. Faithful rewriting is enforced by the preservation guard.

const RETRY_BACKOFF_MS = [2000, 4000, 8000];

export function hasFableKey(): boolean {
  return !!(Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim();
}

/** Appendix review is on by default; set APPENDIX_REVIEW_ENABLED=false to skip it. */
export function appendixReviewEnabled(): boolean {
  return (Deno.env.get("APPENDIX_REVIEW_ENABLED") ?? "true").trim().toLowerCase() !== "false";
}

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });

/** Call Fable 5 with a system + user prompt and return the joined text blocks. */
export async function callFable(system: string, user: string): Promise<string> {
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
    try {
      const response = await client.messages.create({
        model: FABLE_MODEL,
        max_tokens: MAX_TOKENS,
        system,
        messages: [{ role: "user", content: user }],
      });

      const text = response.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      if (!text.trim()) throw new Error("Fable response contained no text block");
      return text;
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      const isRetryable = status === 429 || status === 529 || status === 502 || status === 503 || status === 504;
      const backoff = RETRY_BACKOFF_MS[attempt];
      if (!isRetryable || backoff === undefined) break;
      console.warn(JSON.stringify({ level: "warn", event: "appendix_fable_retry", status, attempt: attempt + 1, backoff_ms: backoff }));
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
