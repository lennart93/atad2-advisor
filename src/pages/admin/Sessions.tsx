import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Seo } from "@/components/Seo";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { SearchFilterBar } from "@/components/admin/SearchFilterBar";
import { AdminCard } from "@/components/admin/AdminCard";
import { StatusChip } from "@/components/admin/StatChip";
import {
  useAdminSessionsList, AdminSessionRow,
} from "@/components/admin/useAdminSessions";

type StatusFilter = "all" | "completed" | "in_progress";

function statusTone(status: string, completed: boolean | null): "success" | "warning" | "neutral" {
  if (completed || status === "completed") return "success";
  if (status === "in_progress") return "warning";
  return "neutral";
}

function scoreTone(score: number | null): "success" | "warning" | "danger" | "neutral" {
  if (score == null) return "neutral";
  if (score >= 7) return "success";
  if (score >= 4) return "warning";
  return "danger";
}

const Sessions = () => {
  const navigate = useNavigate();
  const { data, isLoading } = useAdminSessionsList();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((s) => {
      if (statusFilter === "completed" && !(s.completed || s.status === "completed")) return false;
      if (statusFilter === "in_progress" && (s.completed || s.status !== "in_progress")) return false;
      if (!q) return true;
      return (
        s.session_id.toLowerCase().includes(q) ||
        s.taxpayer_name.toLowerCase().includes(q) ||
        (s.entity_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, search, statusFilter]);

  return (
    <main>
      <Seo title="Admin Sessions" description="Manage ATAD2 sessions" canonical="/admin/sessions" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[22px] font-bold">Sessions</h1>
      </div>

      <SearchFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Search ${data?.length ?? 0} sessions…`}
        filters={
          <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
            <SelectTrigger className="h-9 w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="completed">Completed</SelectItem>
              <SelectItem value="in_progress">In progress</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((s) => (
            <SessionRow key={s.id} session={s} onClick={() => navigate(`/admin/sessions/${s.session_id}`)} />
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-muted-foreground py-8">No sessions found.</div>
          )}
        </div>
      )}
    </main>
  );
};

function SessionRow({ session, onClick }: { session: AdminSessionRow; onClick: () => void }) {
  const completed = Boolean(session.completed || session.status === "completed");
  return (
    <AdminCard interactive onClick={onClick} className="flex items-center gap-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[13px] font-semibold truncate">{session.taxpayer_name}</span>
          {session.entity_name && (
            <span className="text-[11px] text-muted-foreground truncate">· {session.entity_name}</span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground truncate mt-0.5">
          <span className="font-mono">{session.session_id}</span> · FY {session.fiscal_year}
          {session.owner && (
            <> · {session.owner.full_name ?? session.owner.email}</>
          )}
        </div>
      </div>
      <StatusChip label={completed ? "Completed" : session.status} tone={statusTone(session.status, session.completed)} />
      {session.final_score != null && (
        <StatusChip label={`Score ${session.final_score.toFixed(1)}`} tone={scoreTone(session.final_score)} />
      )}
      <div className="text-[11px] text-muted-foreground whitespace-nowrap w-[120px] text-right">
        {new Date(session.created_at).toLocaleDateString()}
      </div>
    </AdminCard>
  );
}

export default Sessions;
