// Retrieve grounded ATAD2 literature (samenwerkende groep + NL rechtsvorm
// classification) from the shared `documents` vector store, scoped to the
// curated knowledge base (metadata.kb='atad2') via match_documents' jsonb
// filter. Best-effort: an empty string when embeddings/retrieval are
// unavailable, so the facts proposal still runs (just ungrounded).

import type { SupabaseClient } from "supabase";
import { embedQuery } from "./embed.ts";

export interface KbQuery {
  category: "samenwerkende_groep" | "rechtsvorm_classificatie" | "rechtsvorm_lijst";
  query: string;
  k: number;
}

interface MatchRow { content?: string; metadata?: { source?: string } }

export async function retrieveKb(c: SupabaseClient, queries: KbQuery[]): Promise<string> {
  const out: string[] = [];
  for (const q of queries) {
    const vec = await embedQuery(q.query);
    if (!vec) continue;
    const { data, error } = await c.rpc("match_documents", {
      query_embedding: vec,
      match_count: q.k,
      filter: { kb: "atad2", category: q.category },
    });
    if (error || !Array.isArray(data)) {
      if (error) console.warn(JSON.stringify({ level: "warn", event: "kb_match_failed", message: String(error.message ?? error).slice(0, 200) }));
      continue;
    }
    for (const row of data as MatchRow[]) {
      if (row.content) out.push(row.content.trim());
    }
  }
  return [...new Set(out)].join("\n\n");
}
