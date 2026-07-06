// Minimal Anthropic caller for the factsheet pipeline (docfacts + merge).
// Mirrors prefill-documents/anthropic.ts (temperature gating for Opus/Sonnet 5,
// 429/5xx backoff) but is self-contained: no ./schemas.ts dependency, and it
// accepts either a string or an array of content blocks as the user message.

import Anthropic from "anthropic";
import type { AnthropicBlock } from "./converters.ts";

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });

export interface CallOptions {
  model: string;
  systemPrompt: string;
  userContent: AnthropicBlock[] | string;
  temperature: number;
  maxTokens: number;
}

export interface CallResult {
  text: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens: number;
    cache_creation_input_tokens: number;
  };
}

const RATE_LIMIT_BACKOFF_MS = [2000, 4000, 8000];

export async function callModel(opts: CallOptions): Promise<CallResult> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= RATE_LIMIT_BACKOFF_MS.length; attempt++) {
    try {
      const content = typeof opts.userContent === "string"
        ? [{ type: "text" as const, text: opts.userContent }]
        : opts.userContent;

      // Opus 4.7+/Opus 5/Sonnet 5 reject the `temperature` parameter (they run
      // at their own fixed/adaptive temperature). Only send temperature for
      // models that still accept it.
      const supportsTemperature = !/^claude-(opus-4-[7-9]|opus-5|sonnet-5)/.test(opts.model);
      const request: Parameters<typeof client.messages.create>[0] = {
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.systemPrompt,
        messages: [{ role: "user", content: content as unknown as Parameters<typeof client.messages.create>[0]["messages"][number]["content"] }],
      };
      if (supportsTemperature) request.temperature = opts.temperature;
      // Sonnet 5 runs adaptive thinking by default; force it off to keep latency
      // within the edge-runtime wall-clock budget (same as generate-appendix).
      if (/^claude-sonnet-5/.test(opts.model)) {
        (request as unknown as { thinking?: unknown }).thinking = { type: "disabled" };
      }

      const response = await client.messages.create(request);
      const text = response.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      if (!text) throw new Error("Anthropic response contained no text block");

      return {
        text,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          cache_read_input_tokens: response.usage.cache_read_input_tokens ?? 0,
          cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? 0,
        },
      };
    } catch (err) {
      lastErr = err;
      const status = (err as { status?: number })?.status;
      const isRetryable = status === 429 || status === 529 || status === 502 || status === 503 || status === 504;
      const backoff = RATE_LIMIT_BACKOFF_MS[attempt];
      if (!isRetryable || backoff === undefined) break;
      console.warn(JSON.stringify({ level: "warn", event: "anthropic_retry", status, attempt: attempt + 1, backoff_ms: backoff }));
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Strip ```json fences and parse the first {...} block. Throws if none found. */
export function parseJsonObject(text: string): unknown {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenceMatch ? fenceMatch[1].trim() : (() => {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start === -1 || end === -1 || end < start) throw new Error("No JSON object found in model output");
    return text.slice(start, end + 1);
  })();
  return JSON.parse(candidate);
}
