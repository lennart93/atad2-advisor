import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Seo } from "@/components/Seo";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/sonner";

const Sessions = () => {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin-sessions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_sessions")
        .select("id, session_id, user_id, taxpayer_name, status, final_score, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 30_000,
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("atad2_sessions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Sessie verwijderd"); qc.invalidateQueries({ queryKey: ["admin-sessions"] }); },
    onError: (e: any) => toast.error(e.message ?? "Mislukt"),
  });

  return (
    <main>
      <Seo title="Admin Sessies" description="Overzicht en beheer van sessies" canonical="/admin/sessions" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Sessies</h1>
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
                <TableHead>Session</TableHead>
                <TableHead>Belastingplichtige</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Score</TableHead>
                <TableHead>Datum</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.session_id}</TableCell>
                  <TableCell>{s.taxpayer_name}</TableCell>
                  <TableCell>{s.status}</TableCell>
                  <TableCell>{s.final_score}</TableCell>
                  <TableCell>{new Date(s.created_at).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="destructive" size="sm" onClick={() => del.mutate(s.id)}>Verwijderen</Button>
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

export default Sessions;
