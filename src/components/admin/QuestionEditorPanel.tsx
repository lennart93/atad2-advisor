import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Trash2, Info } from "lucide-react";
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
import type { AdminQuestion } from "./useAdminQuestions";
import { RiskChip } from "./StatChip";

const Schema = z.object({
  question_id: z.string().min(1, "Required"),
  question_title: z.string().nullable().optional(),
  question: z.string().min(1, "Required"),
  answer_option: z.string().min(1, "Required"),
  risk_points: z.coerce.number().min(0).multipleOf(0.1).default(0),
  next_question_id: z.string().nullable().optional(),
  difficult_term: z.string().nullable().optional(),
  term_explanation: z.string().nullable().optional(),
  question_explanation: z.string().nullable().optional(),
});

export type QuestionFormValues = z.infer<typeof Schema>;

export interface QuestionEditorPanelProps {
  question: AdminQuestion | null;
  allQuestions: AdminQuestion[];
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
      answer_option: question?.answer_option ?? "",
      risk_points: question?.risk_points ?? 0,
      next_question_id: question?.next_question_id ?? "",
      difficult_term: question?.difficult_term ?? "",
      term_explanation: question?.term_explanation ?? "",
      question_explanation: question?.question_explanation ?? "",
    },
  });

  const currentId = question?.question_id;
  const incomingRefs = useMemo(
    () =>
      allQuestions.filter(
        (q) => q.next_question_id === currentId && q.question_id !== currentId
      ),
    [allQuestions, currentId]
  );

  const watchedNext = form.watch("next_question_id");
  const watchedQuestion = form.watch("question");
  const watchedTitle = form.watch("question_title");
  const watchedOptions = form.watch("answer_option");
  const watchedRisk = form.watch("risk_points");
  const watchedExplanation = form.watch("question_explanation");

  return (
    <Form {...form}>
      <form
        className="space-y-5"
        onSubmit={form.handleSubmit(async (v) => { await onSave(v); })}
      >
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

          <FormField control={form.control} name="question_explanation" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <Info className="h-3 w-3" />
                Info panel (shown to users as collapsible explanation)
              </FormLabel>
              <FormControl>
                <Textarea
                  {...field}
                  value={field.value ?? ""}
                  disabled={!canEdit}
                  rows={6}
                  placeholder="Guidance shown to users when they click the info icon next to this question. Supports bullets (lines starting with -) and blank-line paragraphs."
                  className="bg-blue-50/50 border-blue-100 focus-visible:ring-blue-200"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="answer_option" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Answer options
              </FormLabel>
              <FormControl>
                <Input {...field} disabled={!canEdit} placeholder="Yes|No or multiple options separated by |" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <div className="grid grid-cols-2 gap-3">
            <FormField control={form.control} name="risk_points" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Risk points
                </FormLabel>
                <FormControl>
                  <Input type="number" step="0.1" min="0" disabled={!canEdit} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />

            <FormField control={form.control} name="next_question_id" render={({ field }) => (
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
                    {allQuestions
                      .filter((q) => q.question_id !== currentId)
                      .map((q) => (
                        <option key={q.question_id} value={q.question_id}>
                          {q.question_id} · {q.question_title ?? ""}
                        </option>
                      ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )} />
          </div>

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
              {watchedNext ? (
                <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[10px]">
                  {watchedNext}
                </span>
              ) : (
                <span className="text-muted-foreground italic">END</span>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-[#ececec] pt-4">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 font-semibold">
            Preview
          </div>
          <div className="rounded-xl bg-gradient-to-b from-[#eff6ff] to-[#f3f4f6] p-4">
            <div className="rounded-lg bg-white shadow-sm p-4">
              <div className="text-[10px] font-semibold text-[#4f46e5] mb-1">
                Question · risk {typeof watchedRisk === "number" ? watchedRisk.toFixed(1) : "0.0"}
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
                {(watchedOptions || "").split("|").map((opt, i) => (
                  <span key={i} className="rounded-md bg-muted px-3 py-1 text-[11px]">
                    {opt.trim() || "-"}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3 text-[10px] text-muted-foreground">
              <span>Risk:</span>
              <RiskChip points={Number(watchedRisk) || 0} />
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
                      {question?.question_id} will be permanently deleted. This cannot be undone.
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
