import { useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchFilterBar, ViewMode } from "@/components/admin/SearchFilterBar";
import { AdminCard } from "@/components/admin/AdminCard";
import { RiskChip } from "@/components/admin/StatChip";
import { SlideInPanel } from "@/components/admin/SlideInPanel";
import { QuestionEditorPanel } from "@/components/admin/QuestionEditorPanel";
import { QuestionFlowCanvas } from "@/components/admin/QuestionFlowCanvas";
import { AccessRequiredDialog } from "@/components/admin/AccessRequiredDialog";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import {
  useAdminQuestionsList,
  useUpsertAdminQuestion,
  useDeleteAdminQuestion,
  AdminQuestion,
} from "@/components/admin/useAdminQuestions";

const Questions = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { data, isLoading } = useAdminQuestionsList();
  const upsert = useUpsertAdminQuestion();
  const del = useDeleteAdminQuestion();
  const { canEdit } = useAdminAccess();

  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [accessDialog, setAccessDialog] = useState(false);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return data ?? [];
    return (data ?? []).filter((r) =>
      r.question_id.toLowerCase().includes(q) ||
      (r.question_title ?? "").toLowerCase().includes(q) ||
      r.question.toLowerCase().includes(q)
    );
  }, [data, search]);

  const openEdit = useCallback(
    (qid: string) => navigate(`/admin/questions/${qid}`),
    [navigate]
  );
  const closeEdit = useCallback(() => navigate("/admin/questions"), [navigate]);

  const isNewPath = id === "new";
  const editingQuestion: AdminQuestion | null =
    !isNewPath && id
      ? (data ?? []).find((q) => q.question_id === id) ?? null
      : null;
  const panelOpen = Boolean(id);

  return (
    <main>
      <Seo
        title="Admin Questions"
        description="Manage ATAD2 questions"
        canonical="/admin/questions"
      />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[22px] font-bold">Questions</h1>
      </div>

      <SearchFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Search ${data?.length ?? 0} questions…`}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        actions={
          <Button
            size="sm"
            onClick={() => canEdit ? navigate("/admin/questions/new") : setAccessDialog(true)}
            className={!canEdit ? "opacity-60 cursor-help" : ""}
          >
            <Plus className="mr-1 h-4 w-4" /> New question
          </Button>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : viewMode === "list" ? (
        <QuestionList items={filtered} activeId={id} onRowClick={openEdit} />
      ) : (
        <QuestionFlowCanvas
          questions={filtered}
          activeId={id}
          onNodeClick={openEdit}
        />
      )}

      <SlideInPanel
        open={panelOpen}
        onClose={closeEdit}
        subtitle={isNewPath ? "New question" : editingQuestion?.question_id}
        title={
          isNewPath
            ? "Add question"
            : editingQuestion?.question_title ?? "Edit question"
        }
      >
        {panelOpen && (
          <QuestionEditorPanel
            question={editingQuestion}
            allQuestions={data ?? []}
            canEdit={canEdit}
            onRequestAccess={() => setAccessDialog(true)}
            onSave={async (values) => {
              const rowId = editingQuestion?.id;
              await upsert.mutateAsync({ ...(rowId ? { id: rowId } : {}), ...values });
              closeEdit();
            }}
            onDelete={
              editingQuestion
                ? async () => {
                    await del.mutateAsync(editingQuestion.id);
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
        actionLabel="edit questions"
      />
    </main>
  );
};

function QuestionList({
  items, activeId, onRowClick,
}: {
  items: AdminQuestion[];
  activeId?: string;
  onRowClick: (qid: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {items.map((q, i) => (
        <AdminCard
          key={q.id}
          interactive
          onClick={() => onRowClick(q.question_id)}
          className={`flex items-center gap-3 py-2.5 ${
            activeId === q.question_id
              ? "ring-2 ring-[#c7d2fe] border-[#c7d2fe]"
              : ""
          }`}
        >
          <div className="flex items-center justify-center h-6 w-6 rounded-md bg-muted text-[10px] font-bold text-muted-foreground shrink-0">
            {i + 1}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-[#4f46e5]">
                {q.question_id}
              </span>
              {q.question_title && (
                <span className="text-[12px] font-semibold truncate">
                  · {q.question_title}
                </span>
              )}
            </div>
            <div className="text-[12px] text-muted-foreground truncate">
              {q.question}
            </div>
          </div>
          <RiskChip points={q.risk_points ?? 0} />
          <div className="text-[11px] text-muted-foreground whitespace-nowrap w-[92px] text-right">
            → {q.next_question_id || "END"}
          </div>
        </AdminCard>
      ))}
      {items.length === 0 && (
        <div className="text-center text-muted-foreground py-8">
          No questions found.
        </div>
      )}
    </div>
  );
}

export default Questions;
