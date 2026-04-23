import { useMemo } from "react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Trash2, Info, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
              {question.conflicts.map((c) => (
                <div key={c.field} className="bg-white border border-amber-200 rounded-md p-2">
                  <div className="text-[10px] uppercase tracking-wide text-amber-900 font-semibold mb-1">
                    {FIELD_LABELS[c.field] ?? c.field}
                  </div>
                  <div className="grid grid-cols-1 gap-1">
                    {Object.entries(c.byAnswer).map(([ans, val]) => (
                      <div key={ans} className="flex items-start gap-2 text-[11px]">
                        <span className="font-semibold text-foreground w-[70px] shrink-0">
                          {ans}
                        </span>
                        <span
                          className={
                            val === null || val === ""
                              ? "text-muted-foreground italic"
                              : "text-foreground"
                          }
                        >
                          {val === null || val === "" ? "(empty)" : val}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
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
