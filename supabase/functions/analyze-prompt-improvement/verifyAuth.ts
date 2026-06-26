import { createClient, SupabaseClient } from "supabase";

/**
 * Service-role client (bypasses RLS). Mirrors `generate-appendix/verifyAuth.ts`.
 * Required because this function reads outputs across sessions (memos, appendix
 * edits) to find the original the admin improved, which RLS scopes to owners.
 */
export function createServiceClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

/**
 * Verifies the bearer JWT belongs to an admin. Returns the userId on success,
 * or null on any failure. This is the FIRST admin-only (not session-scoped)
 * edge function in the repo: it must gate on the admin role, otherwise the
 * service-role reads below would expose other advisors' outputs to any
 * authenticated user.
 *
 * Uses the existing `has_role(_user_id, _role)` SECURITY DEFINER function, with
 * a direct user_roles select as a fallback if the RPC is unavailable.
 */
export async function verifyAdmin(
  authHeader: string | null,
  service: SupabaseClient,
): Promise<string | null> {
  if (!authHeader) return null;
  const jwt = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await service.auth.getUser(jwt);
  if (userErr || !userData.user) return null;
  const userId = userData.user.id;

  const { data, error } = await service.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!error) return data === true ? userId : null;

  const { data: roles } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin");
  return roles && roles.length > 0 ? userId : null;
}
