import { createClient, SupabaseClient } from "supabase";

/**
 * Returns a Supabase client authenticated with the service role key.
 * Used for writes that should bypass RLS. Mirrors the pattern in
 * `supabase/functions/prefill-documents/index.ts`.
 */
export function createServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/**
 * Given an `Authorization: Bearer <jwt>` header value and a session_id,
 * verifies that the JWT belongs to a user who owns that session.
 * Returns the userId on success, or null on any failure.
 *
 * Mirrors `verifyJwtAndSessionOwnership` in
 * `supabase/functions/prefill-documents/index.ts`.
 */
export async function verifyJwtAndSessionOwnership(
  authHeader: string | null,
  sessionId: string,
  serviceClient: SupabaseClient,
): Promise<string | null> {
  if (!authHeader) return null;
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
