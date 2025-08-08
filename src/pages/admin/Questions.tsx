import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Seo } from "@/components/Seo";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { QuestionForm, QuestionFormValues } from "@/components/admin/QuestionForm";

const Questions = () => {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-questions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_questions")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const upsertMutation = useMutation({
    mutationFn: async (values: QuestionFormValues & { id?: string }) => {
      const payload: any = { ...values };
      const { error } = await supabase.from("atad2_questions").upsert(payload).select().maybeSingle();
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vraag opgeslagen");
      qc.invalidateQueries({ queryKey: ["admin-questions"] });
      setOpen(false);
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message ?? "Opslaan mislukt"),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("atad2_questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Vraag verwijderd");
      qc.invalidateQueries({ queryKey: ["admin-questions"] });
    },
    onError: (e: any) => toast.error(e.message ?? "Verwijderen mislukt"),
  });

  return (
    <main>
      <Seo title="Admin Vragen" description="Beheer van ATAD2 vragen" canonical="/admin/questions" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Vragenbeheer</h1>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditing(null); setOpen(true); }}>Nieuwe vraag</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Vraag bewerken" : "Nieuwe vraag"}</DialogTitle>
            </DialogHeader>
            <QuestionForm
              initialValues={editing ?? undefined}
              onCancel={() => setOpen(false)}
              onSubmit={async (values) => upsertMutation.mutateAsync({ ...(editing || {}), ...values })}
            />
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : (
        <div className="rounded-md border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Titel</TableHead>
                <TableHead>Vraag</TableHead>
                <TableHead>Antwoordoptie</TableHead>
                <TableHead>Risico</TableHead>
                <TableHead>Volgende</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((q: any) => (
                <TableRow key={q.id}>
                  <TableCell className="font-mono text-xs">{q.question_id}</TableCell>
                  <TableCell>{q.question_title}</TableCell>
                  <TableCell className="max-w-[360px] truncate">{q.question}</TableCell>
                  <TableCell>{q.answer_option}</TableCell>
                  <TableCell>{q.risk_points}</TableCell>
                  <TableCell>{q.next_question_id}</TableCell>
                  <TableCell className="text-right space-x-2">
                    <Button variant="outline" size="sm" onClick={() => { setEditing(q); setOpen(true); }}>Bewerken</Button>
                    <Button variant="destructive" size="sm" onClick={() => deleteMutation.mutate(q.id)}>Verwijderen</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
};

export default Questions;
