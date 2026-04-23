import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { diffWordsWithSpace, type Change } from "diff";
import { Trash2, Info, AlertTriangle, Check, Plus, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import {
  Form, FormControl, FormField, FormItem, FormLabel, FormMessage,
} from "@/components/ui/form";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { GroupedQuestion } from "./useAdminQuestions";
import { RiskChip } from "./StatChip";

const BranchSchema = z.object({
  id: z.string(),
  answer_option: z.string().min(1),
  risk_points: z.coerce.number().min(0).multipleOf(0.1).default(0),
  next_question_id: z.string().nullable().optional(),
});

const Schema = z.object({
  question_id: z.string().min(1, "Required"),
  question_title: z.string().nullable().optional(),
  question: z.string().min(1, "Required"),
  difficult_term: z.string().nullable().optional(),
  term_explanation: z.string().nullable().optional(),
  question_explanation: z.string().nullable().optional(),
  branches: z.array(BranchSchema).length(3),
});

export type QuestionFormValues = z.infer<typeof Schema>;

function defaultBranches(): QuestionFormValues["branches"] {
  return [
    { id: "", answer_option: "Yes", risk_points: 0, next_question_id: "" },
    { id: "", answer_option: "No", risk_points: 0, next_question_id: "" },
    { id: "", answer_option: "Unknown", risk_points: 0, next_question_id: "" },
  ];
}

export interface QuestionEditorPanelProps {
  question: GroupedQuestion | null;
  allQuestions: GroupedQuestion[];
  canEdit: boolean;
  onSave: (values: QuestionFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
  onRequestAccess?: () => void;
}

export function QuestionEditorPanel({
  question, allQuestions, canEdit, onSave, onDelete, onCancel, onRequestAccess,
}: QuestionEditorPanelProps) {
  const isNew = question === null;

  const form = useForm<QuestionFormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      question_id: question?.question_id ?? "",
      question_title: question?.question_title ?? "",
      question: question?.question ?? "",
      difficult_term: question?.difficult_term ?? "",
      term_explanation: question?.term_explanation ?? "",
      question_explanation: question?.question_explanation ?? "",
      branches: question?.branches.map((b) => ({
        id: b.id,
        answer_option: b.answer_option,
        risk_points: b.risk_points,
        next_question_id: b.next_question_id ?? "",
      })) ?? defaultBranches(),
    },
  });

  const { fields: branchFields } = useFieldArray({
    control: form.control,
    name: "branches",
  });

  const currentId = question?.question_id;
  const navigate = useNavigate();

  const { data: linkedContextQuestions = [] } = useQuery({
    queryKey: ["context-questions-for", currentId],
    enabled: !!currentId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_context_questions")
        .select("id, answer_trigger, context_question")
        .eq("question_id", currentId!);
      if (error) return [];
      return data ?? [];
    },
  });

  const incomingRefs = useMemo(
    () =>
      allQuestions.filter(
        (q) =>
          q.question_id !== currentId &&
          q.branches.some((b) => b.next_question_id === currentId)
      ),
    [allQuestions, currentId]
  );

  const otherQuestionIds = useMemo(
    () =>
      allQuestions
        .filter((q) => q.question_id !== currentId)
        .map((q) => ({ id: q.question_id, label: q.question_title ?? "" })),
    [allQuestions, currentId]
  );

  const watchedQuestion = form.watch("question");
  const watchedTitle = form.watch("question_title");
  const watchedExplanation = form.watch("question_explanation");
  const watchedBranches = form.watch("branches");
  const previewMaxRisk = Math.max(0, ...watchedBranches.map((b) => Number(b.risk_points) || 0));

  const FIELD_LABELS: Record<string, string> = {
    question: "Question text",
    question_title: "Title",
    question_explanation: "Info panel",
    difficult_term: "Difficult term",
    term_explanation: "Term explanation",
  };

  const renderDiff = (base: string, compared: string) => {
    const parts: Change[] = diffWordsWithSpace(base, compared);
    return parts.map((p, i) => {
      if (p.added) {
        return (
          <span key={i} className="bg-green-100 text-green-900 rounded px-0.5">
            {p.value}
          </span>
        );
      }
      if (p.removed) {
        return (
          <span key={i} className="bg-red-100 text-red-900 line-through rounded px-0.5">
            {p.value}
          </span>
        );
      }
      return <span key={i}>{p.value}</span>;
    });
  };

  return (
    <Form {...form}>
      <form
        className="space-y-5"
        onSubmit={form.handleSubmit(async (v) => { await onSave(v); })}
      >
        {question && question.outOfSync && question.conflicts.length > 0 && (
          <div className="border border-amber-300 bg-amber-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="h-4 w-4 text-amber-700" />
              <div className="text-[13px] font-semibold text-amber-900">
                Branches out of sync
              </div>
            </div>
            <div className="text-[11px] text-amber-800 mb-3">
              The {question.branches.length} rows for this question hold different values
              on the fields below. The form shows the first non-empty value. Saving will
              overwrite all branches with the form values.
            </div>
            <div className="space-y-2">
              {question.conflicts.map((c) => {
                const entries = Object.entries(c.byAnswer);
                const baseEntry = entries.find(([, v]) => v !== null && v !== "") ?? entries[0];
                const [baseAnswer, baseValue] = baseEntry;
                const currentFormValue = form.watch(c.field);
                return (
                  <div key={c.field} className="bg-white border border-amber-200 rounded-md p-2">
                    <div className="flex items-center justify-between mb-1">
                      <div className="text-[10px] uppercase tracking-wide text-amber-900 font-semibold">
                        {FIELD_LABELS[c.field] ?? c.field}
                      </div>
                      {canEdit && (
                        <button
                          type="button"
                          onClick={() =>
                            form.setValue(c.field, "" as never, { shouldDirty: true })
                          }
                          className="text-[10px] text-amber-900 underline hover:no-underline"
                        >
                          Clear field
                        </button>
                      )}
                    </div>
                    <div className="text-[10px] text-muted-foreground mb-2">
                      Pick which branch value should apply to all {question.branches.length} rows.
                      Base: <span className="font-semibold">{baseAnswer}</span>, others shown as diff.
                    </div>
                    <div className="space-y-2">
                      {entries.map(([ans, val]) => {
                        const isEmpty = val === null || val === "";
                        const isBase = ans === baseAnswer;
                        const isSelected =
                          (currentFormValue ?? "") === (val ?? "") && !isEmpty;
                        return (
                          <div
                            key={ans}
                            className={`border-t border-amber-100 pt-1.5 first:border-t-0 first:pt-0 ${
                              isSelected ? "bg-green-50/60 -mx-2 px-2 rounded" : ""
                            }`}
                          >
                            <div className="flex items-center justify-between mb-0.5">
                              <div className="text-[11px] font-semibold text-foreground">
                                {ans}
                                {isBase && (
                                  <span className="ml-1 text-[9px] text-muted-foreground font-normal">
                                    (base)
                                  </span>
                                )}
                                {isSelected && (
                                  <span className="ml-2 inline-flex items-center gap-0.5 text-[9px] text-green-700 font-semibold">
                                    <Check className="h-2.5 w-2.5" /> currently in form
                                  </span>
                                )}
                              </div>
                              {canEdit && !isEmpty && !isSelected && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    form.setValue(c.field, (val ?? "") as never, {
                                      shouldDirty: true,
                                    })
                                  }
                                  className="text-[10px] text-amber-900 underline hover:no-underline"
                                >
                                  Use this
                                </button>
                              )}
                            </div>
                            {isEmpty ? (
                              <div className="text-[11px] text-muted-foreground italic">
                                (empty)
                              </div>
                            ) : isBase ? (
                              <div className="text-[11px] text-foreground whitespace-pre-wrap leading-snug">
                                {val}
                              </div>
                            ) : (
                              <div className="text-[11px] text-foreground whitespace-pre-wrap leading-snug">
                                {renderDiff(baseValue ?? "", val ?? "")}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-3">
          <FormField control={form.control} name="question_id" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Question ID
              </FormLabel>
              <FormControl>
                <Input {...field} disabled={!canEdit || !isNew} placeholder="q_001" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="question_title" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Title
              </FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} disabled={!canEdit} placeholder="Short title" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="question" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Question
              </FormLabel>
              <FormControl>
                <Textarea {...field} rows={4} disabled={!canEdit} placeholder="Full question text" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="difficult_term" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Difficult term
              </FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ""} disabled={!canEdit} placeholder="Optional" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="term_explanation" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Term explanation
              </FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ""} disabled={!canEdit} rows={2} placeholder="Optional" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        {/* User info panel (shared explanation) */}
        <div className="border border-blue-200 bg-blue-50/40 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Info className="h-4 w-4 text-blue-700" />
            <div>
              <div className="text-[13px] font-semibold text-blue-900">User info panel</div>
              <div className="text-[11px] text-blue-700/80">
                Collapsible explanation shown to users beneath the question
              </div>
            </div>
          </div>
          <FormField control={form.control} name="question_explanation" render={({ field }) => (
            <FormItem>
              <FormControl>
                <Textarea
                  {...field}
                  value={field.value ?? ""}
                  disabled={!canEdit}
                  rows={10}
                  placeholder="Guidance shown to users when they click the info icon. Supports bullet lists (lines starting with -) and blank-line paragraphs."
                  className="bg-white border-blue-200 focus-visible:ring-blue-300 font-normal"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        {/* Answer branches (Yes / No / Unknown) */}
        <div className="border border-[#ececec] rounded-lg p-4">
          <div className="text-[13px] font-semibold mb-1">Answer branches</div>
          <div className="text-[11px] text-muted-foreground mb-3">
            Each answer has its own risk score and follow-up question.
          </div>
          <div className="space-y-3">
            {branchFields.map((fld, idx) => {
              const answerLabel = form.getValues(`branches.${idx}.answer_option`);
              return (
                <div key={fld.id} className="border border-[#ececec] rounded-md p-3 bg-muted/20">
                  <div className="text-[11px] font-semibold text-foreground mb-2">
                    {answerLabel}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <FormField
                      control={form.control}
                      name={`branches.${idx}.risk_points`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Risk points
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.1"
                              min="0"
                              disabled={!canEdit}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`branches.${idx}.next_question_id`}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                            Next question
                          </FormLabel>
                          <FormControl>
                            <select
                              {...field}
                              value={field.value ?? ""}
                              disabled={!canEdit}
                              onChange={(e) => field.onChange(e.target.value || null)}
                              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <option value="">END (no follow-up)</option>
                              {otherQuestionIds.map((q) => (
                                <option key={q.id} value={q.id}>
                                  {q.id}{q.label ? ` · ${q.label}` : ""}
                                </option>
                              ))}
                            </select>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Context variants linked to this question */}
        {!isNew && currentId && (
          <div className="border border-[#ececec] rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <div className="text-[13px] font-semibold">Context variants</div>
                <div className="text-[11px] text-muted-foreground">
                  Follow-up questions shown to users based on their answer.
                </div>
              </div>
              {canEdit && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => navigate(`/admin/context-questions/new?qid=${currentId}`)}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Add context variant
                </Button>
              )}
            </div>
            {linkedContextQuestions.length === 0 ? (
              <div className="text-[11px] text-muted-foreground italic py-1">
                No context variants yet.
              </div>
            ) : (
              <div className="space-y-1.5">
                {linkedContextQuestions.map((cq) => (
                  <button
                    key={cq.id}
                    type="button"
                    onClick={() => navigate(`/admin/context-questions/${cq.id}`)}
                    className="w-full text-left border border-[#ececec] rounded-md px-3 py-2 hover:bg-muted/40 flex items-start gap-2"
                  >
                    <span className="text-[10px] rounded bg-muted px-1.5 py-0.5 shrink-0 mt-0.5">
                      on: {cq.answer_trigger}
                    </span>
                    <span className="text-[12px] text-foreground flex-1 line-clamp-2">
                      {cq.context_question}
                    </span>
                    <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0 mt-1" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Flow context */}
        <div className="border-t border-[#ececec] pt-4">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 font-semibold">
            Flow context
          </div>
          <div className="space-y-2 text-[12px]">
            <div>
              <span className="text-muted-foreground">← Comes from:</span>{" "}
              {incomingRefs.length === 0 ? (
                <span className="text-muted-foreground italic">no incoming references</span>
              ) : (
                <span className="inline-flex flex-wrap gap-1 align-middle">
                  {incomingRefs.map((r) => (
                    <span
                      key={r.question_id}
                      className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px]"
                    >
                      {r.question_id}
                    </span>
                  ))}
                </span>
              )}
            </div>
            <div>
              <span className="text-muted-foreground">→ Goes to:</span>{" "}
              <span className="inline-flex flex-wrap gap-1 align-middle">
                {watchedBranches.map((b, i) => (
                  <span
                    key={i}
                    className="rounded-md bg-muted px-1.5 py-0.5 text-[10px]"
                  >
                    {b.answer_option} →{" "}
                    <span className="font-mono">{b.next_question_id || "END"}</span>
                  </span>
                ))}
              </span>
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="border-t border-[#ececec] pt-4">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 font-semibold">
            Preview
          </div>
          <div className="rounded-xl bg-gradient-to-b from-[#eff6ff] to-[#f3f4f6] p-4">
            <div className="rounded-lg bg-white shadow-sm p-4">
              <div className="text-[10px] font-semibold text-[#4f46e5] mb-1">
                Question · max risk {previewMaxRisk.toFixed(1)}
              </div>
              {watchedTitle && (
                <div className="text-[13px] font-bold mb-1.5">{watchedTitle}</div>
              )}
              <div className="text-[12px] text-foreground mb-3">
                {watchedQuestion || <span className="text-muted-foreground italic">(empty)</span>}
              </div>
              {watchedExplanation && (
                <div className="mb-3 p-3 bg-blue-50/50 border border-blue-100 rounded-md">
                  <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wide text-blue-700 font-semibold mb-1.5">
                    <Info className="h-3 w-3" /> Info panel
                  </div>
                  <div className="text-[11px] text-foreground whitespace-pre-line">
                    {watchedExplanation}
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {watchedBranches.map((b, i) => (
                  <span key={i} className="rounded-md bg-muted px-3 py-1 text-[11px]">
                    {b.answer_option}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
              {watchedBranches.map((b, i) => (
                <div key={i} className="flex items-center gap-1">
                  <span>{b.answer_option}:</span>
                  <RiskChip points={Number(b.risk_points) || 0} />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <div>
            {canEdit && !isNew && onDelete && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-[#991b1b] border-[#fecaca]"
                  >
                    <Trash2 className="mr-1 h-3.5 w-3.5" /> Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete question?</AlertDialogTitle>
                    <AlertDialogDescription>
                      {question?.question_id} and all {question?.branches.length ?? 3} branches will be permanently deleted. This cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={async () => { await onDelete(); }}>
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          <div className="flex gap-2">
            {canEdit ? (
              <>
                <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
                <Button type="submit" disabled={form.formState.isSubmitting}>Save</Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={onCancel}>Close</Button>
                <Button
                  type="button"
                  onClick={() => onRequestAccess?.()}
                  className="opacity-60 cursor-help"
                >
                  Save
                </Button>
              </>
            )}
          </div>
        </div>
      </form>
    </Form>
  );
}
