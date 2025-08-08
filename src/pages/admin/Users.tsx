import { useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Seo } from "@/components/Seo";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "@/components/ui/sonner";
import { Skeleton } from "@/components/ui/skeleton";

const Users = () => {
  const qc = useQueryClient();

  const { data: profiles, isLoading: loadingProfiles } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("user_id, email, full_name, created_at").order("created_at", { ascending: false }).limit(1000);
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const { data: roles, isLoading: loadingRoles } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const adminSet = useMemo(() => new Set((roles || []).filter((r: any) => r.role === "admin").map((r: any) => r.user_id)), [roles]);

  const grant = useMutation({
    mutationFn: async (user_id: string) => {
      const { error } = await supabase.from("user_roles").insert({ user_id, role: "admin" });
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Admin toegekend"); qc.invalidateQueries({ queryKey: ["admin-roles"] }); },
    onError: (e: any) => toast.error(e.message ?? "Mislukt"),
  });

  const revoke = useMutation({
    mutationFn: async (user_id: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", user_id).eq("role", "admin");
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Admin ingetrokken"); qc.invalidateQueries({ queryKey: ["admin-roles"] }); },
    onError: (e: any) => toast.error(e.message ?? "Mislukt"),
  });

  const isLoading = loadingProfiles || loadingRoles;

  return (
    <main>
      <Seo title="Admin Gebruikers & Rollen" description="Beheer gebruikers en rollen" canonical="/admin/users" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Gebruikers & Rollen</h1>
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
                <TableHead>Email</TableHead>
                <TableHead>Naam</TableHead>
                <TableHead>Admin</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles?.map((p: any) => {
                const isAdmin = adminSet.has(p.user_id);
                return (
                  <TableRow key={p.user_id}>
                    <TableCell>{p.email}</TableCell>
                    <TableCell>{p.full_name}</TableCell>
                    <TableCell>{isAdmin ? "Ja" : "Nee"}</TableCell>
                    <TableCell className="text-right">
                      {isAdmin ? (
                        <Button variant="outline" size="sm" onClick={() => revoke.mutate(p.user_id)}>Intrekken</Button>
                      ) : (
                        <Button size="sm" onClick={() => grant.mutate(p.user_id)}>Toekennen</Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </main>
  );
};

export default Users;
