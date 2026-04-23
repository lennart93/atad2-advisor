import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/components/ui/sonner";

export type UserRole = "user" | "moderator" | "admin";

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: UserRole }) => {
      const { data: authRes } = await supabase.auth.getUser();
      if (authRes?.user?.id === userId) {
        throw new Error("You cannot change your own role");
      }
      const { error: delErr } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);
      if (delErr) {
        if (delErr.message.includes("can_modify_admin_role")) {
          throw new Error("Cannot remove last admin or insufficient permissions");
        }
        throw delErr;
      }
      if (role !== "user") {
        const { error: insErr } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role });
        if (insErr) {
          if (insErr.message.includes("can_modify_admin_role")) {
            throw new Error("Insufficient permissions to grant admin role");
          }
          throw insErr;
        }
      }
    },
    onSuccess: () => {
      toast.success("Role updated");
      qc.invalidateQueries({ queryKey: ["admin-roles"] });
      qc.invalidateQueries({ queryKey: ["admin-access"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "Failed"),
  });
}
