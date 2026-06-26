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

// Sonnet 4.6 matches the other edge functions: strong enough for the
// prompt-engineering reasoning, fast enough that a single synchronous call
// returns inside the gateway timeout. Bump to an Opus id here if the
// suggestion quality ever needs it (this is the only line to change).
const MODEL = "claude-sonnet-4-6";
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

/** Strip ```json fences and find the first {...} block. Throws if none found. */
export function extractJson(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) {
    throw new Error("No JSON object found in model output");
  }
  return text.slice(start, end + 1);
}
