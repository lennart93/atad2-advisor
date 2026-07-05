// Fable 5 client for the memo review pass.
//
// Isolated from reviewMemo.ts (which stays pure and unit-testable) because this
// file touches Deno.env and the network. n8n-report has no deno.json import map,
// so the Anthropic SDK is imported by full URL rather than a bare specifier.
//
// Required environment:
//   - ANTHROPIC_API_KEY  same key the prefill/appendix functions use on this
//                         project. When absent, the caller skips the review pass.

import Anthropic from "https://esm.sh/@anthropic-ai/sdk@0.30.1";

// Fable 5: the editorial / style model for the memo rewrite. A rewrite is a
// language task, not a reasoning task, so this tier fits and is cheaper/faster
// than the memo generator.
export const FABLE_MODEL = "claude-fable-5";

// The memo is a few thousand tokens; the cap is a safety ceiling, not a target.
// The length-band guard in reviewMemo.ts catches any truncation.
const MAX_TOKENS = 16384;

// NB: the Claude 5 family (Fable 5) rejects the `temperature` parameter
// ("temperature is deprecated for this model"), so we do not send one. Faithful
// rewriting is enforced by the preservation guard, not by a low sampling temp.

const RETRY_BACKOFF_MS = [2000, 4000, 8000];

export function hasFableKey(): boolean {
  return !!(Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim();
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
      console.warn(JSON.stringify({ level: "warn", event: "fable_retry", status, attempt: attempt + 1, backoff_ms: backoff }));
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}
