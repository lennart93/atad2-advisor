import type { SupabaseClient } from "supabase";

const BUCKET = "session-documents";

export async function runCleanup(
  serviceClient: SupabaseClient,
  sessionId: string,
): Promise<{ ok: boolean; deleted_count: number; error?: string }> {
  try {
    const { data: docs } = await serviceClient
      .from("atad2_session_documents")
      .select("id, storage_path")
      .eq("session_id", sessionId);

    const paths = (docs ?? []).map((d) => d.storage_path);
    if (paths.length > 0) {
      const { error: rmErr } = await serviceClient.storage.from(BUCKET).remove(paths);
      if (rmErr) throw new Error(`Storage removal failed: ${rmErr.message}`);
    }

    const { error: delErr } = await serviceClient
      .from("atad2_session_documents")
      .delete()
      .eq("session_id", sessionId);
    if (delErr) throw new Error(`Row deletion failed: ${delErr.message}`);

    console.log(JSON.stringify({
      level: "info", event: "cleanup_completed",
      session_id: sessionId, deleted_count: paths.length,
    }));
    return { ok: true, deleted_count: paths.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(JSON.stringify({
      level: "error", event: "cleanup_failed",
      session_id: sessionId, error: message,
    }));
    return { ok: false, deleted_count: 0, error: message };
  }
}
