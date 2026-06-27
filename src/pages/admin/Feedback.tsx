import { useMemo, useState } from "react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { MessageSquare, Trash2 } from "lucide-react";
import { Seo } from "@/components/Seo";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";
import { SearchFilterBar } from "@/components/admin/SearchFilterBar";
import { AdminCard } from "@/components/admin/AdminCard";
import { StatusChip, StatusTone } from "@/components/admin/StatChip";
import { SlideInPanel } from "@/components/admin/SlideInPanel";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type FeedbackRow = Database["public"]["Tables"]["atad2_feedback"]["Row"];
type Status = FeedbackRow["status"];
type Category = FeedbackRow["category"];

type StatusFilter = "all" | Status;
type CategoryFilter = "all" | Category;

const CATEGORY_LABELS: Record<Category, string> = {
  bug: "Bug",
  idea: "Idea",
  question: "Question",
  other: "Other",
};

// 'new' is a procedural inbox state, not an ATAD2 risk, so it reads neutral
// (not amber). 'done' is a real done-state, so it keeps green.
const STATUS_TONE: Record<Status, StatusTone> = {
  new: "neutral",
  triaged: "neutral",
  done: "success",
};

// Category is decorative labelling, so every category reads neutral.
const CATEGORY_TONE: Record<Category, StatusTone> = {
  bug: "neutral",
  idea: "neutral",
  question: "neutral",
  other: "neutral",
};

function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.max(1, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const Feedback = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-feedback-list"],
    queryFn: async (): Promise<FeedbackRow[]> => {
      const { data, error } = await supabase
        .from("atad2_feedback")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (categoryFilter !== "all" && row.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        row.message.toLowerCase().includes(q) ||
        row.user_email.toLowerCase().includes(q) ||
        (row.page_url ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, search, statusFilter, categoryFilter]);

  const selected = useMemo(
    () => (data ?? []).find((r) => r.id === selectedId) ?? null,
    [data, selectedId]
  );

  const newCount = (data ?? []).filter((r) => r.status === "new").length;

  const updateMut = useMutation({
    mutationFn: async (payload: { id: string; patch: Partial<FeedbackRow> }) => {
      const { error } = await supabase
        .from("atad2_feedback")
        .update(payload.patch)
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-feedback-list"] });
      queryClient.invalidateQueries({ queryKey: ["admin-feedback-new-count"] });
    },
    onError: (err) => {
      toast.error("Update failed", { description: (err as Error).message });
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("atad2_feedback").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Feedback deleted");
      setSelectedId(null);
      queryClient.invalidateQueries({ queryKey: ["admin-feedback-list"] });
      queryClient.invalidateQueries({ queryKey: ["admin-feedback-new-count"] });
    },
    onError: (err) => {
      toast.error("Delete failed", { description: (err as Error).message });
    },
  });

  return (
    <main>
      <Seo title="Admin Feedback" description="User feedback inbox" canonical="/admin/feedback" />

      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">Admin</div>
          <h1 className="text-2xl font-medium tracking-tight">Feedback</h1>
        </div>
        {newCount > 0 && (
          <StatusChip label={`${newCount} new`} tone="neutral" />
        )}
      </div>

      <SearchFilterBar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={`Search ${data?.length ?? 0} items…`}
        filters={
          <>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="triaged">Triaged</SelectItem>
                <SelectItem value="done">Done</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={categoryFilter}
              onValueChange={(v) => setCategoryFilter(v as CategoryFilter)}
            >
              <SelectTrigger className="h-9 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {(Object.keys(CATEGORY_LABELS) as Category[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {CATEGORY_LABELS[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
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
          {filtered.map((row) => (
            <FeedbackRowItem
              key={row.id}
              row={row}
              onClick={() => setSelectedId(row.id)}
            />
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-muted-foreground py-8 flex flex-col items-center gap-2">
              <MessageSquare className="size-6 opacity-50" />
              <span>No feedback yet.</span>
            </div>
          )}
        </div>
      )}

      <SlideInPanel
        open={!!selected}
        onClose={() => setSelectedId(null)}
        subtitle={selected ? CATEGORY_LABELS[selected.category] : undefined}
        title={selected ? selected.user_email : undefined}
        width={520}
      >
        {selected && (
          <FeedbackDetail
            row={selected}
            saving={updateMut.isPending}
            deleting={deleteMut.isPending}
            onChangeStatus={(status) =>
              updateMut.mutate({ id: selected.id, patch: { status } })
            }
            onChangeNotes={(admin_notes) =>
              updateMut.mutate({ id: selected.id, patch: { admin_notes } })
            }
            onDelete={() => {
              if (confirm("Delete this feedback item? This cannot be undone.")) {
                deleteMut.mutate(selected.id);
              }
            }}
          />
        )}
      </SlideInPanel>
    </main>
  );
};

function FeedbackRowItem({
  row,
  onClick,
}: {
  row: FeedbackRow;
  onClick: () => void;
}) {
  return (
    <AdminCard
      interactive
      onClick={onClick}
      className="flex items-center gap-3 py-3 transition-all duration-normal ease-emphasized hover:shadow-sm hover:border-foreground/20"
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StatusChip label={CATEGORY_LABELS[row.category]} tone={CATEGORY_TONE[row.category]} />
          <span className="text-[13px] font-medium truncate">{row.user_email}</span>
        </div>
        <div className="text-[12px] text-foreground/80 mt-1 line-clamp-1">
          {row.message}
        </div>
        {row.page_url && (
          <div className="text-[11px] text-muted-foreground font-mono mt-0.5 truncate">
            {row.page_url}
          </div>
        )}
      </div>
      <StatusChip label={row.status} tone={STATUS_TONE[row.status]} />
      <div className="font-mono text-[11px] text-muted-foreground whitespace-nowrap w-[80px] text-right">
        {timeAgo(row.created_at)}
      </div>
    </AdminCard>
  );
}

function FeedbackDetail({
  row,
  saving,
  deleting,
  onChangeStatus,
  onChangeNotes,
  onDelete,
}: {
  row: FeedbackRow;
  saving: boolean;
  deleting: boolean;
  onChangeStatus: (s: Status) => void;
  onChangeNotes: (n: string) => void;
  onDelete: () => void;
}) {
  const [notes, setNotes] = useState(row.admin_notes ?? "");

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2 flex-wrap">
        <StatusChip label={row.status} tone={STATUS_TONE[row.status]} />
        <span className="text-xs text-muted-foreground">
          {new Date(row.created_at).toLocaleString()}
        </span>
      </div>

      <div>
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
          Message
        </div>
        <div className="text-sm whitespace-pre-wrap rounded-md bg-muted/50 p-3 border border-ds-hairline">
          {row.message}
        </div>
      </div>

      {row.page_url && (
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
            Page
          </div>
          <div className="text-xs font-mono break-all">{row.page_url}</div>
        </div>
      )}

      {row.user_agent && (
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
            User agent
          </div>
          <div className="text-[11px] font-mono text-muted-foreground break-all">
            {row.user_agent}
          </div>
        </div>
      )}

      <div>
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
          Status
        </div>
        <div className="flex items-center gap-1.5">
          {(["new", "triaged", "done"] as Status[]).map((s) => (
            <Button
              key={s}
              size="sm"
              variant={row.status === s ? "default" : "outline"}
              onClick={() => onChangeStatus(s)}
              disabled={saving}
              className="h-8 capitalize"
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      <div>
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1.5">
          Internal notes
        </div>
        <Textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => {
            if ((notes || "") !== (row.admin_notes ?? "")) {
              onChangeNotes(notes);
            }
          }}
          rows={4}
          placeholder="Notes only visible to staff…"
        />
      </div>

      <div className="pt-2 border-t border-ds-hairline">
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          disabled={deleting}
          className="text-ds-red hover:text-ds-red-hover hover:bg-ds-red-bg"
        >
          <Trash2 className="size-4 mr-2" />
          {deleting ? "Deleting…" : "Delete"}
        </Button>
      </div>
    </div>
  );
}

export default Feedback;
