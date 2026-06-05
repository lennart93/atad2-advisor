import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export interface SessionOwner {
  full_name: string | null;
  email: string;
}

export interface AdminSessionRow {
  id: string;
  session_id: string;
  user_id: string | null;
  taxpayer_name: string;
  entity_name: string | null;
  fiscal_year: string;
  status: string;
  final_score: number | null;
  completed: boolean | null;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
  owner: SessionOwner | null;
  // Commercial tracking (admin-only writes). sold = engagement booked,
  // revenue_eur = fee (quoted or booked), null = no amount entered yet.
  sold: boolean;
  revenue_eur: number | null;
  // null = live session, ISO timestamp = deleted snapshot from atad2_assessment_log
  deleted_at: string | null;
}

export interface AdminSessionDetail extends AdminSessionRow {
  additional_context: string | null;
  date_filled: string;
  docx_downloaded_at: string | null;
  fiscal_year: string;
  is_custom_period: boolean;
  outcome_confirmed: boolean | null;
  outcome_overridden: boolean | null;
  override_outcome: string | null;
  override_reason: string | null;
  period_end_date: string | null;
  period_start_date: string | null;
  preliminary_outcome: string | null;
}

async function fetchSessionsWithOwner(sessionIds: string[]): Promise<Map<string, SessionOwner>> {
  if (sessionIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, full_name, email")
    .in("user_id", sessionIds);
  if (error) return new Map();
  const map = new Map<string, SessionOwner>();
  (data ?? []).forEach((p) => {
    map.set(p.user_id, { full_name: p.full_name, email: p.email });
  });
  return map;
}

export function useAdminSessionsList() {
  return useQuery({
    queryKey: ["admin-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_sessions")
        .select(
          "id, session_id, user_id, taxpayer_name, entity_name, fiscal_year, status, final_score, completed, confirmed_at, created_at, updated_at, sold, revenue_eur"
        )
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;

      const userIds = Array.from(new Set((data ?? []).map((s) => s.user_id).filter((v): v is string => !!v)));
      const owners = await fetchSessionsWithOwner(userIds);

      const liveRows: AdminSessionRow[] = (data ?? []).map((s) => ({
        ...s,
        owner: s.user_id ? owners.get(s.user_id) ?? null : null,
        deleted_at: null,
      }));

      // Pull deleted-session snapshots from the assessment log so admins can
      // still see WHO deleted WHAT (taxpayer + entity + FY) even after the
      // user removed the live row. We keep only the latest 'deleted' event
      // per session_uuid, and only for sessions that no longer exist live.
      const liveUuids = new Set(liveRows.map((r) => r.id));
      const { data: deletedEvents } = await supabase
        .from("atad2_assessment_log")
        .select(
          "session_uuid, session_id, user_id, user_email, user_full_name, taxpayer_name, entity_name, fiscal_year, status, final_score, confirmed_at, session_created_at, session_updated_at, event_at"
        )
        .eq("event_type", "deleted")
        .order("event_at", { ascending: false })
        .limit(2000);

      const seenUuids = new Set<string>();
      const deletedRows: AdminSessionRow[] = [];
      for (const e of deletedEvents ?? []) {
        if (liveUuids.has(e.session_uuid)) continue;
        if (seenUuids.has(e.session_uuid)) continue;
        seenUuids.add(e.session_uuid);
        deletedRows.push({
          id: e.session_uuid,
          session_id: e.session_id,
          user_id: e.user_id,
          taxpayer_name: e.taxpayer_name ?? "(unknown)",
          entity_name: e.entity_name,
          fiscal_year: e.fiscal_year ?? "",
          status: e.status ?? "deleted",
          final_score: e.final_score,
          completed: null,
          confirmed_at: e.confirmed_at,
          created_at: e.session_created_at ?? e.event_at,
          updated_at: e.session_updated_at ?? e.event_at,
          owner: e.user_email
            ? { full_name: e.user_full_name ?? null, email: e.user_email }
            : null,
          // The assessment log doesn't snapshot commercial fields; deleted
          // sessions never count toward the revenue totals.
          sold: false,
          revenue_eur: null,
          deleted_at: e.event_at,
        });
      }

      return [...liveRows, ...deletedRows].sort((a, b) =>
        b.created_at.localeCompare(a.created_at)
      );
    },
    staleTime: 30_000,
  });
}

export function useAdminSession(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["admin-session", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_sessions")
        .select("*")
        .eq("session_id", sessionId!)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      let owner: SessionOwner | null = null;
      if (data.user_id) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name, email")
          .eq("user_id", data.user_id)
          .maybeSingle();
        if (profile) owner = { full_name: profile.full_name, email: profile.email };
      }

      // The detail hook always reads a live session row, so it is never a
      // deleted snapshot.
      return { ...data, owner, deleted_at: null } as AdminSessionDetail;
    },
  });
}

export interface AdminAnswerRow {
  id: string;
  session_id: string;
  question_id: string;
  question_text: string;
  answer: string;
  explanation: string;
  risk_points: number;
  difficult_term: string | null;
  term_explanation: string | null;
  answered_at: string;
  created_at: string;
}

export function useAdminSessionAnswers(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["admin-session-answers", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_answers")
        .select("*")
        .eq("session_id", sessionId!)
        .order("answered_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AdminAnswerRow[];
    },
  });
}

export interface AdminReportRow {
  id: string;
  session_id: string;
  report_md: string;
  report_title: string | null;
  risk_category: string | null;
  total_risk: number | null;
  answers_count: number | null;
  model: string | null;
  generated_at: string;
  updated_at: string;
  archived_at: string | null;
  archived_by: string | null;
}

export function useAdminSessionReports(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["admin-session-reports", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_reports")
        .select("*")
        .eq("session_id", sessionId!)
        .order("generated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as AdminReportRow[];
    },
  });
}

export function useResetAdminSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      const { data, error } = await supabase.rpc("admin_reset_session", {
        p_session_id: sessionId,
      });
      if (error) throw error;
      return data as { session_id: string; archived_reports: number; reset_by: string; reset_at: string };
    },
    onSuccess: (result) => {
      toast.success("Session reset", {
        description: `${result.archived_reports} memo${result.archived_reports === 1 ? "" : "s"} archived. User can resume.`,
      });
      qc.invalidateQueries({ queryKey: ["admin-session"] });
      qc.invalidateQueries({ queryKey: ["admin-session-reports"] });
      qc.invalidateQueries({ queryKey: ["admin-session-audit"] });
      qc.invalidateQueries({ queryKey: ["admin-sessions"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Reset failed"),
  });
}

export function useDeleteAdminSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("atad2_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Session deleted");
      qc.invalidateQueries({ queryKey: ["admin-sessions"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Delete failed"),
  });
}

// Removes EVERY assessment log event for a given session_uuid.
// Used to clean up test noise from the audit log so the row
// disappears from the admin overview entirely (not just the
// 'deleted' snapshot — also the 'created' / 'completed' /
// 'backfill' events for that same session).
export function usePurgeAdminLogEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionUuid: string) => {
      const { error } = await supabase
        .from("atad2_assessment_log")
        .delete()
        .eq("session_uuid", sessionUuid);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Audit log entry purged");
      qc.invalidateQueries({ queryKey: ["admin-sessions"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Purge failed"),
  });
}

export interface SetSessionRevenueVars {
  // The public session_id (the RPC's lookup key), not the row UUID.
  sessionId: string;
  sold: boolean;
  revenueEur: number | null;
}

// Admin-only: record whether an assessment was sold and for what fee.
// Writes go through the admin_set_session_revenue SECURITY DEFINER RPC
// (the table's UPDATE policy is owner-only). Optimistic so the row and the
// booked/pipeline totals update instantly, with rollback on failure.
export function useSetSessionRevenue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ sessionId, sold, revenueEur }: SetSessionRevenueVars) => {
      const { error } = await supabase.rpc("admin_set_session_revenue", {
        p_session_id: sessionId,
        p_sold: sold,
        p_revenue_eur: revenueEur,
      });
      if (error) throw error;
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["admin-sessions"] });
      const previous = qc.getQueryData<AdminSessionRow[]>(["admin-sessions"]);
      const prevRow = previous?.find(
        (r) => r.session_id === vars.sessionId && !r.deleted_at
      );
      qc.setQueryData<AdminSessionRow[]>(["admin-sessions"], (rows) =>
        (rows ?? []).map((r) =>
          r.session_id === vars.sessionId && !r.deleted_at
            ? { ...r, sold: vars.sold, revenue_eur: vars.revenueEur }
            : r
        )
      );
      return { prevRow };
    },
    // Roll back only the row we touched (not the whole list snapshot) so a
    // concurrent in-flight edit on a different row isn't reverted.
    onError: (e: Error, vars, ctx) => {
      const prev = ctx?.prevRow;
      if (prev) {
        qc.setQueryData<AdminSessionRow[]>(["admin-sessions"], (rows) =>
          (rows ?? []).map((r) =>
            r.session_id === vars.sessionId && !r.deleted_at
              ? { ...r, sold: prev.sold, revenue_eur: prev.revenue_eur }
              : r
          )
        );
      }
      toast.error(e.message ?? "Could not save");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["admin-sessions"] });
    },
  });
}
