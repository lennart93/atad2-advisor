import { serve } from "std/http/server.ts";
import { createClient, SupabaseClient } from "supabase";
import { runAnalyzeOne } from "./analyze.ts";
import { runCleanup } from "./cleanup.ts";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "*";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface ImageRefPayload {
  doc_label: string;
  storage_path: string;
  mime_type: string;
  relevance_note: string | null;
}

interface PrefillRequest {
  action: "analyze_one" | "cleanup";
  session_id: string;
  question_id?: string;
  question_text?: string;
  question_explanation?: string;
  documents_block?: string;
  image_refs?: ImageRefPayload[];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const body: PrefillRequest = await req.json();
    if (!body.action || !body.session_id) {
      return json({ error: "Missing action or session_id" }, 400);
    }

    const serviceClient = createServiceClient();
    const userId = await verifyJwtAndSessionOwnership(authHeader, body.session_id, serviceClient);
    if (!userId) return json({ error: "Forbidden" }, 403);

    switch (body.action) {
      case "analyze_one": {
        if (!body.question_id || !body.question_text || body.documents_block === undefined) {
          return json({ error: "Missing question_id, question_text, or documents_block" }, 400);
        }
        const result = await runAnalyzeOne(
          serviceClient,
          body.session_id,
          body.question_id,
          body.question_text,
          body.question_explanation ?? "",
          body.documents_block,
          body.image_refs ?? [],
        );
        return json(result, result.ok ? 200 : 500);
      }
      case "cleanup": {
        const result = await runCleanup(serviceClient, body.session_id);
        return json(result, result.ok ? 200 : 500);
      }
      default:
        return json({ error: `Unknown action: ${(body as { action: string }).action}` }, 400);
    }
  } catch (err) {
    console.error(JSON.stringify({ level: "error", event: "unhandled_error", message: String(err) }));
    return json({ error: "Internal error" }, 500);
  }
});

function createServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

async function verifyJwtAndSessionOwnership(
  authHeader: string,
  sessionId: string,
  serviceClient: SupabaseClient,
): Promise<string | null> {
  const jwt = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await serviceClient.auth.getUser(jwt);
  if (userErr || !userData.user) return null;
  const userId = userData.user.id;

  const { data: session } = await serviceClient
    .from("atad2_sessions")
    .select("user_id")
    .eq("session_id", sessionId)
    .maybeSingle();
  if (!session || session.user_id !== userId) return null;
  return userId;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
