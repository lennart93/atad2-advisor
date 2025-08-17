import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";

const QuestionSchema = z.object({
  question_id: z.string().min(1),
  question_title: z.string().optional().nullable(),
  question: z.string().min(1),
  answer_option: z.string().min(1),
  next_question_id: z.string().optional().nullable(),
  risk_points: z.coerce.number().min(0).multipleOf(0.1).default(0),
  difficult_term: z.string().optional().nullable(),
  term_explanation: z.string().optional().nullable(),
});

export type QuestionFormValues = z.infer<typeof QuestionSchema>;

export function QuestionForm({
  initialValues,
  onSubmit,
  onCancel,
}: {
  initialValues?: Partial<QuestionFormValues>;
  onSubmit: (values: QuestionFormValues) => Promise<void>;
  onCancel: () => void;
}) {
  const form = useForm<QuestionFormValues>({
    resolver: zodResolver(QuestionSchema),
    defaultValues: {
      question_id: "",
      question_title: "",
      question: "",
      answer_option: "",
      next_question_id: "",
      risk_points: 0,
      difficult_term: "",
      term_explanation: "",
      ...initialValues,
    },
  });

  const submitting = form.formState.isSubmitting;

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          await onSubmit(values);
        })}
        className="space-y-4"
      >
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
          name="question_title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Titel</FormLabel>
              <FormControl>
                <Input placeholder="Korte titel" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="question"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Vraag</FormLabel>
              <FormControl>
                <Textarea rows={4} placeholder="Volledige vraag" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="answer_option"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Antwoordoptie</FormLabel>
              <FormControl>
                <Input placeholder="Ja/Nee of opties" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <FormField
            control={form.control}
            name="next_question_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Volgende vraag ID</FormLabel>
                <FormControl>
                  <Input placeholder="q_002" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="risk_points"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Risicopunten</FormLabel>
                <FormControl>
                  <Input type="number" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="difficult_term"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Moeilijke term</FormLabel>
                <FormControl>
                  <Input placeholder="Optioneel" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="term_explanation"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Uitleg term</FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder="Optioneel" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Annuleren
          </Button>
          <Button type="submit" disabled={submitting}>
            Opslaan
          </Button>
        </div>
      </form>
    </Form>
  );
}
