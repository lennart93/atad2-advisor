// Anthropic wrapper for the corporate-structure-chart extractor.
//
// Mirrors the conventions of `prefill-documents/anthropic.ts`:
//   - Anthropic SDK is imported via the bare specifier "anthropic", which
//     resolves through `extract-structure/deno.json` to
//     `https://esm.sh/@anthropic-ai/sdk@0.30.1`.
//   - Logs are JSON-structured: { level, event, ... }.
//   - Retries on 429/5xx with exponential backoff.
//
// What this wrapper adds on top of the reference:
//   - Explicit support for prompt caching via a CachedSegment shape. The
//     `cachedSystem` block is sent as a system text block carrying
//     `cache_control: { type: "ephemeral" }`, so all 3 extraction stages
//     reuse the same cached documents+answers context. Caching reduces the
//     input-token cost by ~70% on stages 2 and 3.
//
// Required environment variables:
//   - ANTHROPIC_API_KEY  Anthropic API key (already configured for the
//                         prefill-documents function on the same project).
//
// This file does not call any Supabase APIs and is safe to import from
// the function entrypoint without additional secrets.

import Anthropic from "anthropic";

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });

// Sonnet 5: near-Opus quality at the Sonnet price, and fast enough to finish
// all 3 stages within the Supabase edge-runtime wall-clock limit (~150s per
// isolate). Opus is too slow for this pipeline; users see polling timeouts when
// stage 3 takes >60-90s. Thinking is forced OFF in callClaude because Sonnet 5
// runs adaptive thinking by default, which adds latency and risks that limit;
// turn it back on (adaptive) if the wall-clock budget allows.
const MODEL = "claude-sonnet-5";
// 4096 truncated the facts proposal mid-JSON once the funnel prompt started
// asking for per-entity positions and classifications on larger groups (the
// response is a cap, not a target: short answers stay short and cheap).
const MAX_TOKENS = 16384;

const RATE_LIMIT_BACKOFF_MS = [2000, 4000, 8000];

export interface CachedSegment {
  /** Documents + Q&A block — placed in a cache-breakpoint so all 3 stages reuse it. */
  cachedSystem?: string;
  /** Optional non-cached system suffix appended after the cached block. */
  systemSuffix?: string;
  /** Stage-specific instructions; sent as the user message. */
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
        // The Anthropic SDK accepts either a string or an array of text
        // blocks for `system`. Cast through unknown to satisfy the SDK's
        // exported types, which don't always advertise the array form.
        system: systemBlocks as unknown as Parameters<typeof client.messages.create>[0]["system"],
        messages: [{ role: "user", content: seg.user }],
      };
      // Sonnet 5 enables adaptive thinking by default; force it off to keep
      // per-call latency close to Sonnet 4.6 and stay under the edge runtime
      // wall-clock limit. (The old SDK types don't know `thinking`; cast past them.)
      (request as unknown as { thinking?: unknown }).thinking = { type: "disabled" };

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
