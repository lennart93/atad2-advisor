import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const ContextSchema = z.object({
  question_id: z.string().min(1),
  context_question: z.string().min(1),
  answer_trigger: z.string().min(1),
});

export type ContextFormValues = z.infer<typeof ContextSchema>;

export function ContextQuestionForm({
  initialValues,
  onSubmit,
  onCancel,
}: {
  initialValues?: Partial<ContextFormValues>;
  onSubmit: (values: ContextFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const form = useForm<ContextFormValues>({
    resolver: zodResolver(ContextSchema),
    defaultValues: {
      question_id: "",
      context_question: "",
      answer_trigger: "",
      ...initialValues,
    },
  });

  const submitting = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(async (v) => onSubmit(v))} className="space-y-4">
        <FormField
          control={form.control}
          name="question_id"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Question ID</FormLabel>
              <FormControl>
                <Input placeholder="q_001" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="context_question"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Contextvraag</FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder="Vraag" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="answer_trigger"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Trigger</FormLabel>
              <FormControl>
                <Input placeholder="Bijv. 'Nee'" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Annuleren
          </Button>
          <Button type="submit" disabled={submitting}>Opslaan</Button>
        </div>
      </form>
    </Form>
  );
}
