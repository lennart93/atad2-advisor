// Anthropic wrapper for the admin "Prompt Tuner".
//
// Mirrors `generate-appendix/claude.ts`:
//   - Anthropic SDK via the bare specifier "anthropic" (resolved through
//     this function's deno.json to @anthropic-ai/sdk@0.30.1).
//   - JSON-structured logs.
//   - Retry on 429/5xx with exponential backoff.
//   - Prompt caching: the constant meta-analysis instructions go in a
//     cache-breakpoint system block, so the single retry on a parse failure
//     reuses the cached prefix instead of paying for it twice.
//
// Required environment variables:
//   - ANTHROPIC_API_KEY  (already configured for generate-appendix on the
//                          same project).

import Anthropic from "anthropic";

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });

// Opus 4.8: this admin tool rewrites the prompts that drive every other call,
// so it is the highest-leverage place to spend on quality. It is admin-triggered
// and low-volume, so the extra latency of Opus plus adaptive thinking (enabled
// in callClaude) is fine. Not gateway-latency-bound.
const MODEL = "claude-opus-4-8";
// The proposed revision is a FULL drop-in replacement of the target system
// prompt (memo_system is several thousand tokens) plus the analysis, so the
// cap is generous. It is a ceiling, not a target: short answers stay short.
const MAX_TOKENS = 16384;

const RATE_LIMIT_BACKOFF_MS = [2000, 4000, 8000];

export interface CachedSegment {
  /** Constant meta-analysis instructions, placed in a cache breakpoint. */
  cachedSystem?: string;
  /** Optional non-cached system suffix appended after the cached block. */
  systemSuffix?: string;
  /** Per-run data (current prompt + original + improved); sent as the user message. */
  user: string;
}

export interface CallResult {
  text: string;
  inputTokens: number;
  cachedInputTokens: number;
  cacheCreationInputTokens: number;
  outputTokens: number;
}

type SystemTextBlock = {
  type: "text";
  text: string;
  cache_control?: { type: "ephemeral" };
};

export async function callClaude(seg: CachedSegment): Promise<CallResult> {
  const systemBlocks: SystemTextBlock[] = [];
  if (seg.cachedSystem) {
    systemBlocks.push({
      type: "text",
      text: seg.cachedSystem,
      cache_control: { type: "ephemeral" },
    });
  }
  if (seg.systemSuffix) {
    systemBlocks.push({ type: "text", text: seg.systemSuffix });
  }

  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= RATE_LIMIT_BACKOFF_MS.length; attempt++) {
    try {
      const request: Parameters<typeof client.messages.create>[0] = {
        model: MODEL,
        max_tokens: MAX_TOKENS,
        // The SDK accepts a string or an array of text blocks for `system`;
        // cast through unknown since its exported types don't always advertise
        // the array form.
        system: systemBlocks as unknown as Parameters<typeof client.messages.create>[0]["system"],
        messages: [{ role: "user", content: seg.user }],
      };
      // Opus 4.8 runs without thinking when the field is omitted; turn on
      // adaptive thinking for the meta-reasoning quality this tool needs.
      // (The old SDK types don't know `thinking`; cast past them.)
      (request as unknown as { thinking?: unknown }).thinking = { type: "adaptive" };

      const response = await client.messages.create(request);

      const text = response.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      if (!text) {
        throw new Error("Anthropic response contained no text block");
      }

      const usage = response.usage as unknown as {
        input_tokens: number;
        cache_read_input_tokens?: number | null;
        cache_creation_input_tokens?: number | null;
        output_tokens: number;
      };

      return {
        text,
        inputTokens: usage.input_tokens,
        cachedInputTokens: usage.cache_read_input_tokens ?? 0,
        cacheCreationInputTokens: usage.cache_creation_input_tokens ?? 0,
        outputTokens: usage.output_tokens,
      };
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      const isRetryable = status === 429 || status === 529 || status === 502 || status === 503 || status === 504;
      const backoff = RATE_LIMIT_BACKOFF_MS[attempt];
      if (!isRetryable || backoff === undefined) break;
      console.warn(JSON.stringify({
        level: "warn", event: "anthropic_retry", status, attempt: attempt + 1, backoff_ms: backoff,
      }));
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Strip a wrapping ```json fence and return the {...} block. Throws if none. */
export function extractJson(text: string): string {
  let t = text.trim();
  // Only strip a code fence that wraps the WHOLE payload. The old, unanchored
  // non-greedy `/```(?:json)?\s*([\s\S]*?)```/` stopped at the FIRST inner
  // backtick fence, and this tool routinely puts a full system prompt (which
  // embeds ``` examples) inside proposed_revised_system_prompt, so the match
  // truncated the JSON mid-string -> "Unterminated string in JSON". Anchoring
  // to start/end means an inner fence can no longer cut the payload short; a
  // non-wrapped output falls through to the brace slice untouched.
  const wrap = t.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?\s*```$/);
  if (wrap) t = wrap[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in model output");
  }
  return t.slice(start, end + 1);
}
