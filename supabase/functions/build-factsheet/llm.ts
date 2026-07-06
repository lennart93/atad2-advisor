// Minimal string-in / text-out Anthropic caller for the factsheet merge.
// Same temperature/thinking gating and 429/5xx backoff as
// prefill-documents/anthropic.ts; the merge only ever sends a text user
// message, so no content-block plumbing is needed here.

import Anthropic from "anthropic";

const client = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });

const RATE_LIMIT_BACKOFF_MS = [2000, 4000, 8000];

export interface CallResult {
  text: string;
  input_tokens: number;
  output_tokens: number;
}

export async function callModel(opts: {
  model: string;
  systemPrompt: string;
  user: string;
  temperature: number;
  maxTokens: number;
}): Promise<CallResult> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= RATE_LIMIT_BACKOFF_MS.length; attempt++) {
    try {
      const supportsTemperature = !/^claude-(opus-4-[7-9]|opus-5|sonnet-5)/.test(opts.model);
      const request: Parameters<typeof client.messages.create>[0] = {
        model: opts.model,
        max_tokens: opts.maxTokens,
        system: opts.systemPrompt,
        messages: [{ role: "user", content: opts.user }],
      };
      if (supportsTemperature) request.temperature = opts.temperature;
      if (/^claude-sonnet-5/.test(opts.model)) {
        (request as unknown as { thinking?: unknown }).thinking = { type: "disabled" };
      }
      const response = await client.messages.create(request);
      const text = response.content
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n");
      if (!text) throw new Error("Anthropic response contained no text block");
      return { text, input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens };
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
