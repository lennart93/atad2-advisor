import Anthropic from "anthropic";
import type { AnthropicBlock } from "./converters.ts";
import type { TokenUsageType } from "./schemas.ts";

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
  usage: TokenUsageType;
}

const RATE_LIMIT_BACKOFF_MS = [2000, 4000, 8000];

export async function callOpus(opts: CallOptions): Promise<CallResult> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= RATE_LIMIT_BACKOFF_MS.length; attempt++) {
    try {
      const content = typeof opts.userContent === "string"
        ? [{ type: "text" as const, text: opts.userContent }]
        : opts.userContent;

      // Opus 4.7 and similar models reject the `temperature` parameter
      // (Anthropic returns 400 "`temperature` is deprecated for this model").
      // Only include temperature for models that still accept it.
      const supportsTemperature = !/^claude-(opus-4-[7-9]|opus-5|sonnet-5)/.test(opts.model);
      const request: Parameters<typeof client.messages.create>[0] = {
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.systemPrompt,
        messages: [{ role: "user", content: content as unknown as Parameters<typeof client.messages.create>[0]["messages"][number]["content"] }],
      };
      if (supportsTemperature) {
        request.temperature = opts.temperature;
      }
      const response = await client.messages.create(request);

      const textBlock = response.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("Anthropic response contained no text block");
      }

      return {
        text: textBlock.text,
        usage: {
          input_tokens: response.usage.input_tokens,
          output_tokens: response.usage.output_tokens,
          cache_creation_input_tokens: response.usage.cache_creation_input_tokens ?? null,
          cache_read_input_tokens: response.usage.cache_read_input_tokens ?? null,
        },
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

export function extractJson<T>(text: string, validator: { parse: (v: unknown) => T }): T {
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(trimmed);
  return validator.parse(parsed);
}
