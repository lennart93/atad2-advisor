import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ShieldCheck, Shield, User as UserIcon } from "lucide-react";
import { Seo } from "@/components/Seo";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { AdminCard } from "@/components/admin/AdminCard";
import { IconChip } from "@/components/admin/IconChip";
import { StatusChip } from "@/components/admin/StatChip";
import { SearchFilterBar } from "@/components/admin/SearchFilterBar";
import { AccessRequiredDialog } from "@/components/admin/AccessRequiredDialog";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useUpdateUserRole, UserRole } from "@/components/admin/useAdminUsers";

interface ProfileRow {
  user_id: string;
  email: string;
  full_name: string | null;
  created_at: string;
}

function currentRole(userId: string, roles: { user_id: string; role: UserRole }[]): UserRole {
  const mine = roles.filter((r) => r.user_id === userId);
  if (mine.some((r) => r.role === "admin")) return "admin";
  if (mine.some((r) => r.role === "moderator")) return "moderator";
  return "user";
}

const Users = () => {
  const { canEdit } = useAdminAccess();
  const { user: currentUser } = useAuth();
  const [search, setSearch] = useState("");
  const [accessDialog, setAccessDialog] = useState(false);
  const [confirmChange, setConfirmChange] = useState<
    { user: ProfileRow; newRole: UserRole; oldRole: UserRole } | null
  >(null);

  const { data: profiles, isLoading: loadingProfiles } = useQuery({
    queryKey: ["admin-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("user_id, email, full_name, created_at")
        .order("created_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as ProfileRow[];
    },
    staleTime: 60_000,
  });

  const { data: roles = [], isLoading: loadingRoles } = useQuery({
    queryKey: ["admin-roles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("user_id, role");
      if (error) throw error;
      return (data ?? []) as { user_id: string; role: UserRole }[];
    },
    staleTime: 60_000,
  });

  const updateRole = useUpdateUserRole();

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return profiles ?? [];
    return (profiles ?? []).filter(
      (p) =>
        p.email.toLowerCase().includes(q) ||
        (p.full_name ?? "").toLowerCase().includes(q)
    );
  }, [profiles, search]);

  const handleRoleChange = (user: ProfileRow, newRole: UserRole) => {
    if (!canEdit) {
      setAccessDialog(true);
      return;
    }
    if (currentUser?.id === user.user_id) {
      toast.error("You cannot change your own role");
      return;
    }
    const oldRole = currentRole(user.user_id, roles);
    if (oldRole === newRole) return;
    setConfirmChange({ user, newRole, oldRole });
  };

  const roleLabel = (r: UserRole) => (r === "admin" ? "Admin" : r === "moderator" ? "Moderator" : "User");

  const isLoading = loadingProfiles || loadingRoles;

  return (
    <main>
      <Seo title="Admin Users & Roles" description="Manage users and roles" canonical="/admin/users" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[22px] font-bold">Users & Roles</h1>
      </div>

      <SearchFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Search ${profiles?.length ?? 0} users…`}
      />

      {isLoading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((p) => {
            const role = currentRole(p.user_id, roles);
            const Icon = role === "admin" ? ShieldCheck : role === "moderator" ? Shield : UserIcon;
            const isSelf = currentUser?.id === p.user_id;
            const dropdownLocked = !canEdit || isSelf;
            return (
              <AdminCard key={p.user_id} className="flex items-center gap-4 py-3">
                <IconChip icon={Icon} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="text-[13px] font-semibold truncate">
                    {p.full_name || p.email}
                    {isSelf && <span className="ml-2 text-[10px] text-muted-foreground font-normal">(you)</span>}
                  </div>
                  <div className="text-[11px] text-muted-foreground truncate">{p.email}</div>
                </div>
                <StatusChip
                  label={role === "admin" ? "Admin" : role === "moderator" ? "Moderator" : "User"}
                  tone={role === "admin" ? "success" : role === "moderator" ? "warning" : "neutral"}
                />
                <div className="w-[140px]">
                  <Select
                    value={role}
                    onValueChange={(v) => handleRoleChange(p, v as UserRole)}
                    disabled={dropdownLocked}
                  >
                    <SelectTrigger
                      className={`h-8 text-[12px] ${dropdownLocked ? "opacity-60 cursor-not-allowed" : ""}`}
                      title={isSelf ? "You cannot change your own role" : undefined}
                      onClick={(e) => {
                        if (!canEdit) {
                          e.preventDefault();
                          setAccessDialog(true);
                        }
                      }}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="user">User</SelectItem>
                      <SelectItem value="moderator">Moderator</SelectItem>
                      <SelectItem value="admin">Admin</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </AdminCard>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center text-muted-foreground py-8">No users found.</div>
          )}
        </div>
      )}

      <AlertDialog
        open={confirmChange !== null}
        onOpenChange={(open) => !open && setConfirmChange(null)}
      >
        <AlertDialogContent>
          {confirmChange && (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>Change role</AlertDialogTitle>
                <AlertDialogDescription>
                  Change role for <strong>{confirmChange.user.email}</strong> from{" "}
                  <strong>{roleLabel(confirmChange.oldRole)}</strong> to{" "}
                  <strong>{roleLabel(confirmChange.newRole)}</strong>? This action is logged.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    updateRole.mutate({
                      userId: confirmChange.user.user_id,
                      role: confirmChange.newRole,
                    });
                    setConfirmChange(null);
                  }}
                >
                  Confirm
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>

      <AccessRequiredDialog
        open={accessDialog}
        onOpenChange={setAccessDialog}
        actionLabel="change user roles"
      />
    </main>
  );
};

export default Users;
