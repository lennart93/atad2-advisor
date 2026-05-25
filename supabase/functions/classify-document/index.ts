import { serve } from "std/http/server.ts";
import { createClient } from "supabase";
import Anthropic from "anthropic";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const VALID_CATEGORIES = [
  "financial_statements",
  "tax_returns",
  "structure_chart",
  "previous_year_atad2_analysis",
  "client_correspondence",
  "local_file",
  "master_file",
  "trial_balance",
  "general_ledger",
  "memo",
  "comment_letter_to_tax_return",
  "other",
] as const;

const SYSTEM_PROMPT = `You are classifying a document uploaded to a Dutch corporate-tax (ATAD2) advisory tool.
Pick exactly one category from the list and return strict JSON: { "category": "<value>", "confidence": <0..1> }.
Valid categories: ${VALID_CATEGORIES.join(", ")}.
"other" is the fallback when nothing fits. Use confidence 0..1 to indicate how sure you are.`;

const THIN_WORD_THRESHOLD = 200;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const { document_id } = (await req.json()) as { document_id?: string };
    if (!document_id) return json({ error: "Missing document_id" }, 400);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // 1. Load the document row.
    const { data: doc, error: docErr } = await supabase
      .from("atad2_session_documents")
      .select("id, filename, storage_path, mime_type, category, category_source")
      .eq("id", document_id)
      .single();
    if (docErr || !doc) return json({ error: "Document not found" }, 404);

    // 2. User overrides are sacred — never overwrite.
    if (doc.category_source === "user") {
      return json({ skipped: "user_override" }, 200);
    }

    // 3. Pull a small chunk of content to look at.
    const { sample, isThin } = await fetchSample(supabase, doc.storage_path, doc.mime_type);

    // 4. If we have nothing to look at, just mark thin and exit.
    if (!sample) {
      await supabase
        .from("atad2_session_documents")
        .update({ is_thin: true, category_source: "ai" })
        .eq("id", document_id);
      return json({ category: doc.category, is_thin: true }, 200);
    }

    // 5. Ask Haiku to classify. Send filename + sample.
    let aiCategory: string | null = null;
    let confidence = 0;
    try {
      const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
      const response = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 100,
        system: SYSTEM_PROMPT,
        messages: [{
          role: "user",
          content: `Filename: ${doc.filename}\n\nContent sample:\n${sample.slice(0, 2000)}`,
        }],
      });
      const textBlock = response.content.find((b) => b.type === "text");
      if (textBlock && textBlock.type === "text") {
        const parsed = parseClassification(textBlock.text);
        if (parsed) {
          aiCategory = parsed.category;
          confidence = parsed.confidence;
        }
      }
    } catch (err) {
      console.error("[classify-document] anthropic failed", err);
    }

    // 6. Decide what to write back.
    const patch: { is_thin: boolean; category_source: "ai"; category?: string } = {
      is_thin: isThin,
      category_source: "ai",
    };
    if (aiCategory && VALID_CATEGORIES.includes(aiCategory as typeof VALID_CATEGORIES[number]) && confidence >= 0.5) {
      patch.category = aiCategory;
    }

    const { error: updErr } = await supabase
      .from("atad2_session_documents")
      .update(patch)
      .eq("id", document_id);
    if (updErr) {
      console.error("[classify-document] update failed", updErr);
      return json({ error: "Update failed" }, 500);
    }

    return json({ category: patch.category ?? doc.category, is_thin: isThin }, 200);
  } catch (err) {
    console.error("[classify-document] error", err);
    return json({ error: (err as Error).message }, 500);
  }
});

async function fetchSample(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  storagePath: string,
  mimeType: string,
): Promise<{ sample: string; isThin: boolean }> {
  // Images have no text content here — flag thin.
  if (mimeType.startsWith("image/")) {
    return { sample: "", isThin: true };
  }
  const { data: file, error } = await supabase.storage.from("session-documents").download(storagePath);
  if (error || !file) return { sample: "", isThin: true };
  // PDFs and DOCX are stored as text/plain because the client extracts text
  // at upload time (see useUploadDocument). So we can just .text() everything
  // text-ish that lands here.
  const text = (await file.text()).trim();
  const wordCount = text ? text.split(/\s+/).length : 0;
  return { sample: text, isThin: wordCount < THIN_WORD_THRESHOLD };
}

function parseClassification(raw: string): { category: string; confidence: number } | null {
  const trimmed = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const obj = JSON.parse(trimmed);
    if (typeof obj.category !== "string" || typeof obj.confidence !== "number") return null;
    return { category: obj.category, confidence: obj.confidence };
  } catch {
    return null;
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
