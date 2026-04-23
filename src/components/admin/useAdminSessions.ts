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
          "id, session_id, user_id, taxpayer_name, entity_name, fiscal_year, status, final_score, completed, confirmed_at, created_at, updated_at"
        )
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;

      const userIds = Array.from(new Set((data ?? []).map((s) => s.user_id).filter((v): v is string => !!v)));
      const owners = await fetchSessionsWithOwner(userIds);

      return (data ?? []).map((s) => ({
        ...s,
        owner: s.user_id ? owners.get(s.user_id) ?? null : null,
      })) as AdminSessionRow[];
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

      return { ...data, owner } as AdminSessionDetail;
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
}

export function useAdminSessionReport(sessionId: string | undefined) {
  return useQuery({
    queryKey: ["admin-session-report", sessionId],
    enabled: !!sessionId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_reports")
        .select("*")
        .eq("session_id", sessionId!)
        .order("generated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as AdminReportRow | null;
    },
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
