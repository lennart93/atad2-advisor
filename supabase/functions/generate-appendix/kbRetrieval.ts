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
  // The queries are independent (each its own embedding + vector match), so run
  // them concurrently; sequentially they sat on the generation's critical path.
  // Result order follows the input order, exactly as the sequential loop did.
  const perQuery = await Promise.all(queries.map(async (q) => {
    const vec = await embedQuery(q.query);
    if (!vec) return [];
    const { data, error } = await c.rpc("match_documents", {
      query_embedding: vec,
      match_count: q.k,
      filter: { kb: "atad2", category: q.category },
    });
    if (error || !Array.isArray(data)) {
      if (error) console.warn(JSON.stringify({ level: "warn", event: "kb_match_failed", message: String(error.message ?? error).slice(0, 200) }));
      return [];
    }
    return (data as MatchRow[]).map((row) => row.content?.trim()).filter((s): s is string => !!s);
  }));
  return [...new Set(perQuery.flat())].join("\n\n");
}
