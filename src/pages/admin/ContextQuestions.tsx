import { useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
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

const ContextQuestions = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
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

  const openEdit = useCallback(
    (rid: string) => navigate(`/admin/context-questions/${rid}`),
    [navigate]
  );
  const closeEdit = useCallback(() => navigate("/admin/context-questions"), [navigate]);

  const isNewPath = id === "new";
  const editing: AdminContextQuestion | null =
    !isNewPath && id
      ? (data ?? []).find((r) => r.id === id) ?? null
      : null;
  const panelOpen = Boolean(id);

  return (
    <main>
      <Seo
        title="Admin Context Questions"
        description="Manage ATAD2 context questions"
        canonical="/admin/context-questions"
      />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[22px] font-bold">Context questions</h1>
      </div>

      <SearchFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Search ${data?.length ?? 0} context questions…`}
        actions={
          <Button
            size="sm"
            onClick={() => canEdit ? navigate("/admin/context-questions/new") : setAccessDialog(true)}
            className={!canEdit ? "opacity-60 cursor-help" : ""}
          >
            <Plus className="mr-1 h-4 w-4" /> New context question
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((r) => (
            <AdminCard
              key={r.id}
              interactive
              onClick={() => openEdit(r.id)}
              className={`flex items-center gap-3 py-2.5 ${
                id === r.id ? "ring-2 ring-[#67e8f9] border-[#67e8f9]" : ""
              }`}
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-[#0891b2]">
                    {r.question_id}
                  </span>
                  <span className="text-[10px] rounded bg-muted px-1.5 py-0.5">
                    on: {r.answer_trigger}
                  </span>
                </div>
                <div className="text-[12px] text-muted-foreground truncate mt-0.5">
                  {r.context_question}
                </div>
              </div>
            </AdminCard>
          ))}
          {filtered.length === 0 && (
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
