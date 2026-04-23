import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Trash2 } from "lucide-react";
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
import type { AdminContextQuestion } from "./useAdminContextQuestions";

const Schema = z.object({
  question_id: z.string().min(1, "Required"),
  context_question: z.string().min(1, "Required"),
  answer_trigger: z.string().min(1, "Required"),
});
export type ContextQuestionFormValues = z.infer<typeof Schema>;

export interface ContextQuestionEditorPanelProps {
  question: AdminContextQuestion | null;
  parentQuestionIds: string[];
  canEdit: boolean;
  onSave: (values: ContextQuestionFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
  onRequestAccess?: () => void;
}

export function ContextQuestionEditorPanel({
  question, parentQuestionIds, canEdit, onSave, onDelete, onCancel, onRequestAccess,
}: ContextQuestionEditorPanelProps) {
  const isNew = question === null;

  const form = useForm<ContextQuestionFormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      question_id: question?.question_id ?? "",
      context_question: question?.context_question ?? "",
      answer_trigger: question?.answer_trigger ?? "",
    },
  });

  const watchedQ = form.watch("context_question");
  const watchedTrigger = form.watch("answer_trigger");

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
                Linked to question
              </FormLabel>
              <FormControl>
                <select
                  {...field}
                  disabled={!canEdit}
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <option value="">— pick question —</option>
                  {parentQuestionIds.map((id) => (
                    <option key={id} value={id}>{id}</option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="answer_trigger" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Trigger (on which answer?)
              </FormLabel>
              <FormControl>
                <Input {...field} disabled={!canEdit} placeholder='e.g. "Yes" or "No"' />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />

          <FormField control={form.control} name="context_question" render={({ field }) => (
            <FormItem>
              <FormLabel className="text-[10px] uppercase tracking-wide text-muted-foreground">
                Context question
              </FormLabel>
              <FormControl>
                <Textarea {...field} rows={4} disabled={!canEdit} placeholder="The follow-up question" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )} />
        </div>

        <div className="border-t border-[#ececec] pt-4">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2 font-semibold">
            Preview
          </div>
          <div className="rounded-xl bg-gradient-to-b from-[#cffafe] to-[#f3f4f6] p-4">
            <div className="rounded-lg bg-white shadow-sm p-4">
              <div className="text-[10px] font-semibold text-[#0891b2] mb-1">
                Shown when answer = "{watchedTrigger}"
              </div>
              <div className="text-[12px] text-foreground">
                {watchedQ || <span className="text-muted-foreground italic">(empty)</span>}
              </div>
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
                    <AlertDialogTitle>Delete context question?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This cannot be undone.
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
