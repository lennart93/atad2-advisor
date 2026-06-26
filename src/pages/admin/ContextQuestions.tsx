import { useMemo, useState, useCallback } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchFilterBar } from "@/components/admin/SearchFilterBar";
import { AdminCard } from "@/components/admin/AdminCard";
import { SlideInPanel } from "@/components/admin/SlideInPanel";
import { ContextQuestionEditorPanel } from "@/components/admin/ContextQuestionEditorPanel";
import {
  useAdminContextQuestionsList,
  useUpsertAdminContextQuestion,
  useDeleteAdminContextQuestion,
  AdminContextQuestion,
} from "@/components/admin/useAdminContextQuestions";
import { useAdminQuestionsList } from "@/components/admin/useAdminQuestions";
import { AccessRequiredDialog } from "@/components/admin/AccessRequiredDialog";
import { useAdminAccess } from "@/hooks/useAdminAccess";

interface ContextGroup {
  question_id: string;
  triggers: { trigger: string; variants: AdminContextQuestion[] }[];
  totalVariants: number;
}

const ContextQuestions = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const [searchParams] = useSearchParams();
  const { data, isLoading } = useAdminContextQuestionsList();
  const { data: parentQuestions } = useAdminQuestionsList();
  const upsert = useUpsertAdminContextQuestion();
  const del = useDeleteAdminContextQuestion();
  const { canEdit } = useAdminAccess();

  const [search, setSearch] = useState("");
  const [accessDialog, setAccessDialog] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((r) =>
      r.question_id.toLowerCase().includes(q) ||
      r.context_question.toLowerCase().includes(q) ||
      r.answer_trigger.toLowerCase().includes(q)
    );
  }, [data, search]);

  const groups: ContextGroup[] = useMemo(() => {
    const byQid = new Map<string, Map<string, AdminContextQuestion[]>>();
    for (const row of filtered) {
      if (!byQid.has(row.question_id)) byQid.set(row.question_id, new Map());
      const byTrigger = byQid.get(row.question_id)!;
      if (!byTrigger.has(row.answer_trigger)) byTrigger.set(row.answer_trigger, []);
      byTrigger.get(row.answer_trigger)!.push(row);
    }
    const result: ContextGroup[] = [];
    for (const [question_id, byTrigger] of byQid.entries()) {
      const triggers = Array.from(byTrigger.entries())
        .map(([trigger, variants]) => ({ trigger, variants }))
        .sort((a, b) => a.trigger.localeCompare(b.trigger));
      const totalVariants = triggers.reduce((n, t) => n + t.variants.length, 0);
      result.push({ question_id, triggers, totalVariants });
    }
    return result.sort((a, b) =>
      a.question_id.localeCompare(b.question_id, undefined, { numeric: true })
    );
  }, [filtered]);

  const openEdit = useCallback(
    (rid: string) => navigate(`/admin/context-questions/${rid}`),
    [navigate]
  );
  const closeEdit = useCallback(() => navigate("/admin/context-questions"), [navigate]);
  const openNew = useCallback(
    (prefill?: { qid?: string; trigger?: string }) => {
      if (!canEdit) {
        setAccessDialog(true);
        return;
      }
      const params = new URLSearchParams();
      if (prefill?.qid) params.set("qid", prefill.qid);
      if (prefill?.trigger) params.set("trigger", prefill.trigger);
      const qs = params.toString();
      navigate(`/admin/context-questions/new${qs ? `?${qs}` : ""}`);
    },
    [canEdit, navigate]
  );

  const isNewPath = id === "new";
  const editing: AdminContextQuestion | null =
    !isNewPath && id
      ? (data ?? []).find((r) => r.id === id) ?? null
      : null;
  const panelOpen = Boolean(id);
  const prefillQid = isNewPath ? searchParams.get("qid") ?? undefined : undefined;
  const prefillTrigger = isNewPath ? searchParams.get("trigger") ?? undefined : undefined;

  return (
    <main>
      <Seo
        title="Admin Context Questions"
        description="Manage ATAD2 context questions"
        canonical="/admin/context-questions"
      />
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">Admin</div>
          <h1 className="text-2xl font-semibold tracking-tight">Context questions</h1>
        </div>
      </div>

      <SearchFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Search ${data?.length ?? 0} context questions…`}
        actions={
          <Button
            size="sm"
            onClick={() => openNew()}
            className={!canEdit ? "opacity-60 cursor-help" : ""}
          >
            <Plus className="mr-1 h-4 w-4" /> New context question
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map((g) => (
            <div
              key={g.question_id}
              className="rounded-[12px] border border-border bg-card transition-colors duration-fast hover:border-foreground/20"
            >
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-xs font-semibold text-ds-ink-secondary">
                    Q{g.question_id}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                    {g.totalVariants} variant{g.totalVariants === 1 ? "" : "s"}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className={`h-7 text-[11px] ${!canEdit ? "opacity-60 cursor-help" : ""}`}
                  onClick={() => openNew({ qid: g.question_id })}
                >
                  <Plus className="mr-1 h-3 w-3" /> Add variant
                </Button>
              </div>

              <div className="p-2 space-y-2">
                {g.triggers.map((t) => (
                  <div key={t.trigger} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 px-1">
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                        on: <span className="font-semibold text-foreground">{t.trigger}</span>
                        <span className="ml-1 text-muted-foreground">
                          ({t.variants.length})
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() => openNew({ qid: g.question_id, trigger: t.trigger })}
                        className={`text-[10px] text-ds-ink-secondary hover:underline ${
                          !canEdit ? "opacity-60 cursor-help" : ""
                        }`}
                      >
                        + Add "{t.trigger}" variant
                      </button>
                    </div>
                    <div className="space-y-1">
                      {t.variants.map((r) => (
                        <AdminCard
                          key={r.id}
                          interactive
                          onClick={() => openEdit(r.id)}
                          className={`flex items-center gap-3 py-2 ${
                            id === r.id ? "ring-2 ring-ds-ink border-ds-ink" : ""
                          }`}
                        >
                          <div className="text-[12px] text-foreground min-w-0 flex-1">
                            {r.context_question}
                          </div>
                        </AdminCard>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {groups.length === 0 && (
            <div className="text-center text-muted-foreground py-8">
              No context questions found.
            </div>
          )}
        </div>
      )}

      <SlideInPanel
        open={panelOpen}
        onClose={closeEdit}
        subtitle={isNewPath ? "New context question" : editing?.question_id}
        title={isNewPath ? "Add context question" : "Edit context question"}
      >
        {panelOpen && (
          <ContextQuestionEditorPanel
            question={editing}
            prefillQuestionId={prefillQid}
            prefillAnswerTrigger={prefillTrigger}
            parentQuestionIds={(parentQuestions ?? []).map((p) => p.question_id)}
            canEdit={canEdit}
            onRequestAccess={() => setAccessDialog(true)}
            onSave={async (values) => {
              const rid = editing?.id;
              await upsert.mutateAsync({ ...(rid ? { id: rid } : {}), ...values });
              closeEdit();
            }}
            onDelete={
              editing
                ? async () => {
                    await del.mutateAsync(editing.id);
                    closeEdit();
                  }
                : undefined
            }
            onCancel={closeEdit}
          />
        )}
      </SlideInPanel>

      <AccessRequiredDialog
        open={accessDialog}
        onOpenChange={setAccessDialog}
        actionLabel="edit context questions"
      />
    </main>
  );
};

export default ContextQuestions;
