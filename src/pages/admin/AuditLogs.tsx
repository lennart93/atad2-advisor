import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Seo } from "@/components/Seo";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AdminCard } from "@/components/admin/AdminCard";
import { StatusChip } from "@/components/admin/StatChip";
import { SearchFilterBar } from "@/components/admin/SearchFilterBar";

interface AuditLogRow {
  id: string;
  user_id: string | null;
  action: string;
  table_name: string;
  record_id: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  created_at: string;
  profiles?: { email: string } | null;
}

const ACTION_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  INSERT: "success",
  UPDATE: "warning",
  DELETE: "danger",
};

const AuditLogs = () => {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState<string>("all");

  const { data: logs, isLoading } = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("id, user_id, action, table_name, record_id, old_values, new_values, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      const rows = (data ?? []) as unknown as AuditLogRow[];

      const userIds = Array.from(
        new Set(rows.map((r) => r.user_id).filter((v): v is string => !!v))
      );
      if (userIds.length === 0) return rows;

      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, email")
        .in("user_id", userIds);
      const emailByUserId = new Map(
        (profiles ?? []).map((p) => [p.user_id, p.email ?? null])
      );
      return rows.map((r) => ({
        ...r,
        profiles: r.user_id ? { email: emailByUserId.get(r.user_id) ?? "" } : null,
      }));
    },
    staleTime: 30_000,
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (logs ?? []).filter((log) => {
      if (actionFilter !== "all" && log.action !== actionFilter) return false;
      if (!q) return true;
      return (
        log.table_name.toLowerCase().includes(q) ||
        (log.profiles?.email ?? "").toLowerCase().includes(q) ||
        (log.record_id ?? "").toLowerCase().includes(q)
      );
    });
  }, [logs, search, actionFilter]);

  return (
    <div>
      <Seo title="Audit Logs" description="Security audit logs" canonical="/admin/audit" />
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="text-[11px] font-normal uppercase tracking-[0.16em] text-ds-ink-secondary mb-1">Admin</div>
          <h1 className="text-2xl font-normal tracking-tight">Audit log</h1>
          <p className="mt-1 text-ds-ink-secondary">A running record of changes across the workspace, with who acted and what moved.</p>
        </div>
      </div>

      <SearchFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search by table, email, record id…"
        filters={
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="h-9 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              <SelectItem value="INSERT">Insert</SelectItem>
              <SelectItem value="UPDATE">Update</SelectItem>
              <SelectItem value="DELETE">Delete</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {isLoading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((log) => (
            <AdminCard
              key={log.id}
              className="py-3 transition-colors duration-fast hover:bg-muted/30"
            >
              <div className="flex items-center gap-3 flex-wrap">
                <StatusChip label={log.action} tone={ACTION_TONE[log.action] ?? "neutral"} />
                <span className="text-xs font-mono text-foreground/80">{log.table_name}</span>
                <span className="text-[11px] text-muted-foreground truncate flex-1 min-w-0">
                  {log.profiles?.email || log.user_id || "System"}
                </span>
                <span className="text-xs font-mono text-muted-foreground whitespace-nowrap">
                  {format(new Date(log.created_at), "yyyy-MM-dd HH:mm:ss")}
                </span>
              </div>
              {log.record_id && (
                <div className="text-[10px] font-mono text-muted-foreground mt-1">
                  record: {log.record_id}
                </div>
              )}
              {log.action === "UPDATE" && log.old_values && log.new_values && (
                <div className="mt-2 text-[11px] space-y-0.5">
                  {Object.keys(log.new_values).map((key) => {
                    const oldVal = log.old_values?.[key];
                    const newVal = log.new_values?.[key];
                    if (oldVal === newVal || key === "updated_at") return null;
                    return (
                      <div key={key} className="truncate">
                        <span className="font-normal text-foreground">{key}:</span>{" "}
                        <span className="text-muted-foreground line-through">
                          {String(oldVal).slice(0, 40)}
                        </span>{" "}
                        → <span className="text-foreground">{String(newVal).slice(0, 40)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {log.action === "INSERT" && (
                <div className="text-[11px] text-muted-foreground mt-1">New record created</div>
              )}
              {log.action === "DELETE" && (
                <div className="text-[11px] text-muted-foreground mt-1">Record deleted</div>
              )}
            </AdminCard>
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-muted-foreground py-8">No audit events match the current filters.</div>
          )}
        </div>
      )}
    </div>
  );
};

export default AuditLogs;
