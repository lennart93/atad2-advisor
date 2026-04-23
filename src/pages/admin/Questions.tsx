import { useMemo, useState, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Plus, AlertTriangle } from "lucide-react";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchFilterBar, ViewMode } from "@/components/admin/SearchFilterBar";
import { AdminCard } from "@/components/admin/AdminCard";
import { RiskChip } from "@/components/admin/StatChip";
import { SlideInPanel } from "@/components/admin/SlideInPanel";
import { QuestionEditorPanel, QuestionFormValues } from "@/components/admin/QuestionEditorPanel";
import { QuestionFlowCanvas } from "@/components/admin/QuestionFlowCanvas";
import { AccessRequiredDialog } from "@/components/admin/AccessRequiredDialog";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import {
  useAdminGroupedQuestions,
  useSaveGroupedQuestion,
  useDeleteGroupedQuestion,
  GroupedQuestion,
} from "@/components/admin/useAdminQuestions";

const Questions = () => {
  const navigate = useNavigate();
  const { id } = useParams<{ id?: string }>();
  const { data, isLoading } = useAdminGroupedQuestions();
  const save = useSaveGroupedQuestion();
  const del = useDeleteGroupedQuestion();
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
  const editingQuestion: GroupedQuestion | null =
    !isNewPath && id
      ? (data ?? []).find((q) => q.question_id === id) ?? null
      : null;
  const panelOpen = Boolean(id);

  const handleSave = async (values: QuestionFormValues) => {
    await save.mutateAsync({
      question_id: values.question_id,
      question_title: values.question_title ?? null,
      question: values.question,
      difficult_term: values.difficult_term ?? null,
      term_explanation: values.term_explanation ?? null,
      question_explanation: values.question_explanation ?? null,
      branches: values.branches.map((b) => ({
        id: b.id,
        answer_option: b.answer_option,
        risk_points: b.risk_points,
        next_question_id: b.next_question_id ?? null,
      })),
      isNew: isNewPath,
    });
    if (isNewPath) {
      navigate(`/admin/questions/${values.question_id}`);
    } else {
      closeEdit();
    }
  };

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
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
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
            onSave={handleSave}
            onDelete={
              editingQuestion
                ? async () => {
                    await del.mutateAsync(editingQuestion.question_id);
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
  items: GroupedQuestion[];
  activeId?: string;
  onRowClick: (qid: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {items.map((q, i) => {
        const maxRisk = Math.max(0, ...q.branches.map((b) => b.risk_points));
        return (
          <AdminCard
            key={q.question_id}
            interactive
            onClick={() => onRowClick(q.question_id)}
            className={`flex items-start gap-3 py-2.5 ${
              activeId === q.question_id
                ? "ring-2 ring-[#c7d2fe] border-[#c7d2fe]"
                : ""
            }`}
          >
            <div className="flex items-center justify-center h-6 w-6 rounded-md bg-muted text-[10px] font-bold text-muted-foreground shrink-0 mt-0.5">
              {i + 1}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold text-[#4f46e5]">
                  {q.question_id}
                </span>
                {q.question_title && (
                  <span className="text-[12px] font-semibold truncate">
                    · {q.question_title}
                  </span>
                )}
                {q.outOfSync && (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-100 text-amber-800 text-[9px] px-1.5 py-0.5">
                    <AlertTriangle className="h-2.5 w-2.5" /> Branches out of sync
                  </span>
                )}
              </div>
              <div className="text-[12px] text-muted-foreground truncate mt-0.5">
                {q.question}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {q.branches.map((b) => (
                  <span
                    key={b.id}
                    className="inline-flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-[10px]"
                  >
                    <span className="font-semibold">{b.answer_option}</span>
                    <span className="text-muted-foreground">
                      → {b.next_question_id || "END"}
                    </span>
                    <RiskChip points={b.risk_points} className="text-[9px] px-1 py-0" />
                  </span>
                ))}
              </div>
            </div>
            <div className="flex flex-col items-end shrink-0">
              <RiskChip points={maxRisk} />
              <div className="text-[9px] text-muted-foreground mt-0.5">max risk</div>
            </div>
          </AdminCard>
        );
      })}
      {items.length === 0 && (
        <div className="text-center text-muted-foreground py-8">
          No questions found.
        </div>
      )}
    </div>
  );
}

export default Questions;
