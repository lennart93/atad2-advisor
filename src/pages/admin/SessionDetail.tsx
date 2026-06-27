import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, RotateCcw, Trash2 } from "lucide-react";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { AccessRequiredDialog } from "@/components/admin/AccessRequiredDialog";
import ReactMarkdown from "react-markdown";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AdminCard } from "@/components/admin/AdminCard";
import { RiskChip, StatusChip } from "@/components/admin/StatChip";
import { supabase } from "@/integrations/supabase/client";
import {
  useAdminSession, useAdminSessionAnswers, useAdminSessionReports, useDeleteAdminSession, useResetAdminSession,
  AdminAnswerRow, AdminReportRow,
} from "@/components/admin/useAdminSessions";

interface AuditLogRow {
  id: string;
  action: string;
  table_name: string;
  record_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  user_id: string | null;
}

function useSessionAuditLogs(sessionUuid: string | undefined) {
  return useQuery({
    queryKey: ["admin-session-audit", sessionUuid],
    enabled: !!sessionUuid,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, action, table_name, record_id, old_values, new_values, created_at, user_id")
        .eq("record_id", sessionUuid!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as AuditLogRow[];
    },
  });
}

const SessionDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: session, isLoading: loadingSession } = useAdminSession(id);
  const { data: answers = [], isLoading: loadingAnswers } = useAdminSessionAnswers(id);
  const { data: reports = [], isLoading: loadingReport } = useAdminSessionReports(id);
  const { data: auditLogs = [] } = useSessionAuditLogs(session?.id);
  const del = useDeleteAdminSession();
  const reset = useResetAdminSession();
  const { canEdit } = useAdminAccess();
  const [accessDialog, setAccessDialog] = useState(false);
  const hasActiveMemo = reports.some((r) => !r.archived_at);

  if (loadingSession) {
    return (
      <main>
        <Skeleton className="h-8 w-48 mb-4" />
        <Skeleton className="h-24 w-full" />
      </main>
    );
  }

  if (!session) {
    return (
      <main>
        <div className="text-center py-16">
          <div className="text-muted-foreground mb-4">Session not found.</div>
          <Button variant="outline" onClick={() => navigate("/admin/sessions")}>
            Back to sessions
          </Button>
        </div>
      </main>
    );
  }

  const completed = Boolean(session.completed || session.status === "completed");

  return (
    <main>
      <Seo title={`Session ${session.session_id}`} description="Session detail" canonical={`/admin/sessions/${id}`} />

      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate("/admin/sessions")}>
          <ArrowLeft className="mr-1 h-4 w-4" /> All sessions
        </Button>
        <div className="flex items-center gap-2">
          {canEdit && hasActiveMemo && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" disabled={reset.isPending}>
                  <RotateCcw className="mr-1 h-3.5 w-3.5" />
                  {reset.isPending ? "Resetting..." : "Reset for re-run"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Reset session for re-run?</AlertDialogTitle>
                  <AlertDialogDescription>
                    The current memo for {session.taxpayer_name} ({session.session_id}) will be archived. The user will see this session as "In progress" again and can resume to generate a new memo. Archived memos stay visible here in admin.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      await reset.mutateAsync(session.session_id);
                    }}
                  >
                    Reset
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
          {canEdit ? (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" size="sm" className="text-ds-red border-ds-red">
                  <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete session
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete session?</AlertDialogTitle>
                  <AlertDialogDescription>
                    {session.taxpayer_name} ({session.session_id}) will be permanently deleted, including answers and reports. This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={async () => {
                      await del.mutateAsync(session.id);
                      navigate("/admin/sessions");
                    }}
                  >
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : (
            <Button
              variant="outline"
              size="sm"
              className="text-ds-red border-ds-red opacity-60 cursor-help"
              onClick={() => setAccessDialog(true)}
            >
              <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete session
            </Button>
          )}
        </div>
      </div>

      <AdminCard className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-xs font-mono text-muted-foreground">{session.session_id}</div>
            <h1 className="text-2xl font-medium tracking-tight truncate mt-1">{session.taxpayer_name}</h1>
            {session.entity_name && (
              <div className="text-[12px] text-muted-foreground mt-0.5">{session.entity_name}</div>
            )}
          </div>
          <div className="flex flex-col items-end gap-2 text-right">
            <StatusChip label={completed ? "Completed" : session.status} tone={completed ? "success" : "neutral"} />
            {session.final_score != null && (
              <div className="text-2xl font-medium tracking-tight tabular-nums">
                {session.final_score.toFixed(1)}
              </div>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 pt-4 border-t border-border text-[11px]">
          <InfoCell label="Fiscal year" value={session.fiscal_year} />
          <InfoCell
            label="Period"
            value={
              session.period_start_date && session.period_end_date
                ? `${session.period_start_date} → ${session.period_end_date}`
                : "-"
            }
          />
          <InfoCell
            label="Owner"
            value={session.owner?.full_name ?? session.owner?.email ?? "-"}
          />
          <InfoCell label="Created" value={new Date(session.created_at).toLocaleString()} />
          <InfoCell
            label="Confirmed"
            value={session.confirmed_at ? new Date(session.confirmed_at).toLocaleString() : "-"}
          />
        </div>
      </AdminCard>

      <Tabs defaultValue="dossier">
        <TabsList>
          <TabsTrigger value="dossier">Dossier</TabsTrigger>
          <TabsTrigger value="journey">Journey</TabsTrigger>
          <TabsTrigger value="audit">Audit</TabsTrigger>
        </TabsList>

        <TabsContent value="dossier">
          <DossierTab answers={answers} loadingAnswers={loadingAnswers} reports={reports} loadingReport={loadingReport} />
        </TabsContent>

        <TabsContent value="journey">
          <JourneyTab answers={answers} loading={loadingAnswers} />
        </TabsContent>

        <TabsContent value="audit">
          <AuditTab logs={auditLogs} />
        </TabsContent>
      </Tabs>

      <PrefillSection sessionId={session.session_id} />

      <AccessRequiredDialog
        open={accessDialog}
        onOpenChange={setAccessDialog}
        actionLabel="delete this session"
      />
    </main>
  );
};

function PrefillSection({ sessionId }: { sessionId: string }) {
  const { data: docs } = useQuery({
    queryKey: ["admin-session-docs", sessionId],
    queryFn: async () => {
      const { data } = await supabase.from("atad2_session_documents").select("*").eq("session_id", sessionId);
      return data ?? [];
    },
  });
  const { data: prefills } = useQuery({
    queryKey: ["admin-session-prefills", sessionId],
    queryFn: async () => {
      const { data } = await supabase.from("atad2_question_prefills").select("*").eq("session_id", sessionId);
      return data ?? [];
    },
  });
  const { data: job } = useQuery({
    queryKey: ["admin-session-job", sessionId],
    queryFn: async () => {
      const { data } = await supabase.from("atad2_prefill_jobs").select("*").eq("session_id", sessionId).maybeSingle();
      return data;
    },
  });

  if (!job && (docs?.length ?? 0) === 0 && (prefills?.length ?? 0) === 0) return null;

  return (
    <section className="mt-6">
      <h2 className="text-lg font-medium mb-2">Document Pre-Fill</h2>
      <div className="space-y-2 text-sm">
        <div>Job status: {job?.status ?? "-"}</div>
        <div>Documents: {(docs ?? []).length}</div>
        <div>Suggestions: {(prefills ?? []).length}</div>
        {(prefills ?? []).length > 0 && (
          <details>
            <summary className="cursor-pointer">Show suggestions</summary>
            <div className="space-y-1 mt-2">
              {prefills?.map((p) => (
                <div key={p.id} className="border rounded p-2 text-xs">
                  <div><strong>Q{p.question_id}</strong> · {p.user_action}</div>
                  <div>{p.suggested_toelichting}</div>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-medium">{label}</div>
      <div className="text-foreground mt-1 font-mono text-xs">{value}</div>
    </div>
  );
}

function DossierTab({
  answers, loadingAnswers, reports, loadingReport,
}: {
  answers: AdminAnswerRow[];
  loadingAnswers: boolean;
  reports: AdminReportRow[];
  loadingReport: boolean;
}) {
  return (
    <div className="space-y-6 pt-4">
      <section>
        <h2 className="text-[14px] font-medium mb-2">Answers</h2>
        {loadingAnswers ? (
          <Skeleton className="h-24 w-full" />
        ) : answers.length === 0 ? (
          <AdminCard>
            <div className="text-muted-foreground text-[13px]">No answers recorded.</div>
          </AdminCard>
        ) : (
          <div className="space-y-1.5">
            {answers.map((a, i) => (
              <AdminCard key={a.id} className="py-3">
                <div className="flex items-start gap-3">
                  <div className="flex items-center justify-center h-6 w-6 rounded-md bg-muted text-[10px] font-normal text-muted-foreground shrink-0">
                    {i + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[10px] font-mono text-muted-foreground">{a.question_id}</span>
                      <RiskChip points={a.risk_points ?? 0} />
                    </div>
                    <div className="text-[13px] font-medium mb-1">{a.question_text}</div>
                    <div className="text-[12px]">
                      <span className="text-muted-foreground">Answer:</span>{" "}
                      <span className="font-medium">{a.answer}</span>
                    </div>
                    {a.explanation && (
                      <div className="text-[11px] text-muted-foreground mt-1 line-clamp-3">
                        {a.explanation}
                      </div>
                    )}
                  </div>
                </div>
              </AdminCard>
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-[14px] font-medium mb-2">Report / memo</h2>
        {loadingReport ? (
          <Skeleton className="h-32 w-full" />
        ) : reports.length === 0 ? (
          <AdminCard>
            <div className="text-muted-foreground text-[13px]">No report generated yet.</div>
          </AdminCard>
        ) : (
          <div className="space-y-3">
            {reports.map((report) => (
              <AdminCard key={report.id} className={report.archived_at ? "opacity-75" : ""}>
                <div className="flex items-center justify-between mb-3 text-[11px] text-muted-foreground">
                  <div className="flex items-center gap-3">
                    <span>Generated {new Date(report.generated_at).toLocaleString()}</span>
                    {report.model && <span className="font-mono">{report.model}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    {report.archived_at ? (
                      <StatusChip
                        label={`Archived ${new Date(report.archived_at).toLocaleDateString()}`}
                        tone="neutral"
                      />
                    ) : (
                      <StatusChip label="Active" tone="neutral" />
                    )}
                    {report.total_risk != null && (
                      <StatusChip label={`Total risk ${report.total_risk.toFixed(1)}`} tone="neutral" />
                    )}
                  </div>
                </div>
                <article className="markdown-body text-[13px]">
                  <ReactMarkdown>{report.report_md}</ReactMarkdown>
                </article>
              </AdminCard>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function JourneyTab({ answers, loading }: { answers: AdminAnswerRow[]; loading: boolean }) {
  const events = useMemo(() => {
    const sorted = [...answers].sort((a, b) => a.answered_at.localeCompare(b.answered_at));
    return sorted.map((a, i) => {
      const prev = sorted[i - 1];
      const gapMs = prev ? new Date(a.answered_at).getTime() - new Date(prev.answered_at).getTime() : 0;
      return { ...a, gapMs };
    });
  }, [answers]);

  if (loading) return <Skeleton className="h-32 w-full mt-4" />;
  if (events.length === 0) {
    return (
      <div className="pt-4">
        <AdminCard>
          <div className="text-muted-foreground text-[13px]">No journey events.</div>
        </AdminCard>
      </div>
    );
  }

  return (
    <div className="pt-4 space-y-2">
      {events.map((e) => (
        <div key={e.id} className="flex items-start gap-3">
          <div className="w-[120px] shrink-0 text-[11px] text-muted-foreground pt-2 font-mono">
            {new Date(e.answered_at).toLocaleTimeString()}
          </div>
          <div className="flex-1">
            <AdminCard className="py-2.5">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono text-muted-foreground">{e.question_id}</span>
                {e.gapMs > 300_000 && (
                  <StatusChip label={`${Math.round(e.gapMs / 60_000)} min gap`} tone="neutral" />
                )}
              </div>
              <div className="text-[12px] font-medium">{e.question_text}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">
                → {e.answer}
              </div>
            </AdminCard>
          </div>
        </div>
      ))}
    </div>
  );
}

function AuditTab({ logs }: { logs: AuditLogRow[] }) {
  if (logs.length === 0) {
    return (
      <div className="pt-4">
        <AdminCard>
          <div className="text-muted-foreground text-[13px]">No audit events for this session.</div>
        </AdminCard>
      </div>
    );
  }

  // Audit action labels are neutral metadata, not risk or done-state signals,
  // so they all read as plain neutral chips.
  const actionTone = (): "neutral" => "neutral";

  return (
    <div className="pt-4 space-y-1.5">
      {logs.map((log) => (
        <AdminCard key={log.id} className="py-2.5">
          <div className="flex items-center gap-3">
            <StatusChip label={log.action} tone={actionTone()} />
            <span className="text-[11px] font-mono text-muted-foreground truncate flex-1">
              {log.table_name}
            </span>
            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
              {new Date(log.created_at).toLocaleString()}
            </span>
          </div>
          {log.action === "UPDATE" && log.old_values && log.new_values && (
            <div className="mt-2 text-[11px] space-y-0.5">
              {Object.keys(log.new_values).map((key) => {
                const oldVal = log.old_values?.[key];
                const newVal = log.new_values?.[key];
                if (oldVal === newVal || key === "updated_at") return null;
                return (
                  <div key={key} className="truncate">
                    <span className="font-medium text-foreground">{key}:</span>{" "}
                    <span className="text-muted-foreground line-through">{String(oldVal).slice(0, 40)}</span>
                    {" → "}
                    <span className="text-foreground">{String(newVal).slice(0, 40)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </AdminCard>
      ))}
    </div>
  );
}

export default SessionDetail;
