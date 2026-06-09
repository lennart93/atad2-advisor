// Azure OpenAI ada-002 query embedding for knowledge-base retrieval.
// Best-effort: returns null when not configured or on any error, so facts
// generation keeps working (just without the grounded literature) if the
// embedding endpoint is unavailable.
//
// Required env (set on the supabase-edge-functions container):
//   AZURE_OPENAI_ENDPOINT          e.g. https://atad2.cognitiveservices.azure.com/
//   AZURE_OPENAI_KEY               the resource key
//   AZURE_OPENAI_EMBED_DEPLOYMENT  default "text-embedding-ada-002"
//   AZURE_OPENAI_API_VERSION       default "2023-05-15"

const ENDPOINT = Deno.env.get("AZURE_OPENAI_ENDPOINT") ?? "";
const KEY = Deno.env.get("AZURE_OPENAI_KEY") ?? "";
const DEPLOY = Deno.env.get("AZURE_OPENAI_EMBED_DEPLOYMENT") ?? "text-embedding-ada-002";
const VER = Deno.env.get("AZURE_OPENAI_API_VERSION") ?? "2023-05-15";

export function embeddingsConfigured(): boolean {
  return Boolean(ENDPOINT && KEY);
}

export async function embedQuery(text: string): Promise<number[] | null> {
  if (!embeddingsConfigured()) return null;
  try {
    const url = `${ENDPOINT.replace(/\/+$/, "")}/openai/deployments/${DEPLOY}/embeddings?api-version=${VER}`;
    const r = await fetch(url, {
      method: "POST",
      headers: { "api-key": KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ input: text.slice(0, 20000) }),
    });
    if (!r.ok) {
      console.warn(JSON.stringify({ level: "warn", event: "embed_failed", status: r.status }));
      return null;
    }
    const j = await r.json();
    const vec = j?.data?.[0]?.embedding;
    return Array.isArray(vec) ? vec : null;
  } catch (e) {
    console.warn(JSON.stringify({ level: "warn", event: "embed_error", message: String(e).slice(0, 200) }));
    return null;
  }
}
