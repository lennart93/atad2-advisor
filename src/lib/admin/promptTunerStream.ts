// Pure parsing for the Prompt Tuner analyze response. The edge function
// streams NDJSON heartbeat lines while the model works (so the Kong proxy
// does not cut the connection at its read timeout) and ends with one payload
// line. The previously deployed function returns a single plain-JSON body;
// both shapes parse the same way: the last meaningful JSON line wins.

export interface AnalyzePayload {
  analysis?: unknown;
  error?: string;
  target_prompt_version?: number;
  target_prompt_key?: string;
}

export function parseAnalyzeResponseText(text: string): AnalyzePayload {
  const lines = text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(lines[i]) as AnalyzePayload & { heartbeat?: boolean };
      if (obj && typeof obj === "object" && !obj.heartbeat) return obj;
    } catch {
      // Not a JSON line (e.g. an HTML error page); keep scanning backwards.
    }
  }
  throw new Error("The analyzer returned no result.");
}
