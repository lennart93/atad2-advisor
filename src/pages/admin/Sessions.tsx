import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Download, Plus, Trash2 } from "lucide-react";
import { Seo } from "@/components/Seo";
import { formatFiscalYears } from "@/utils/formatFiscalYears";
import { taxpayerDisplayName } from "@/lib/taxpayer";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";
import { SearchFilterBar } from "@/components/admin/SearchFilterBar";
import { AdminCard } from "@/components/admin/AdminCard";
import { StatusChip } from "@/components/admin/StatChip";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import {
  useAdminSessionsList, useDeleteAdminSession, usePurgeAdminLogEntry,
  useSetSessionRevenue, AdminSessionRow,
} from "@/components/admin/useAdminSessions";
import { exportAssessmentsToExcel } from "@/lib/admin/exportAssessments";

type StatusFilter = "all" | "completed" | "in_progress" | "deleted";

function statusTone(status: string, completed: boolean | null): "success" | "neutral" {
  // Completed is a clean done-state (green). 'In progress' and everything else
  // are procedural, not risk, so they stay neutral.
  if (completed || status === "completed") return "success";
  return "neutral";
}

// final_score is the sum of per-answer risk_points and lives on the
// 0.0–~2.0 fractional scale. Both the risk-identified (≥1.0) and the
// insufficient-information (≥0.2) outcomes are real ATAD2 attention, so they
// share the amber (warning) tone; below 0.2 = no risk identified, a clean
// outcome (success / green).
function scoreTone(score: number | null): "success" | "warning" | "neutral" {
  if (score == null) return "neutral";
  if (score >= 0.2) return "warning";
  return "success";
}

const eur0 = new Intl.NumberFormat("en-IE", {
  style: "currency", currency: "EUR", currencyDisplay: "code", maximumFractionDigits: 0,
});
const eur2 = new Intl.NumberFormat("en-IE", {
  style: "currency", currency: "EUR", currencyDisplay: "code", minimumFractionDigits: 2, maximumFractionDigits: 2,
});
// Whole euros are the norm for advisory fees; only show cents when present.
function formatEur(n: number): string {
  return Number.isInteger(n) ? eur0.format(n) : eur2.format(n);
}

// revenue_eur is numeric(12,2): max 9,999,999,999.99. Reject larger amounts
// client-side so they never reach the RPC and overflow with a raw Postgres error.
const MAX_FEE = 9_999_999_999.99;

// Parse a free-text fee field. Accepts both "1000.50" and the Dutch
// comma-decimal "1000,50"; rejects ambiguous/garbled input (multiple
// separators, letters, over-max) so a wrong number can never save silently.
function parseFee(raw: string): { valid: boolean; value: number | null } {
  const normalized = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (normalized === "") return { valid: true, value: null };
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return { valid: false, value: null };
  const n = parseFloat(normalized);
  if (!Number.isFinite(n) || n > MAX_FEE) return { valid: false, value: null };
  return { valid: true, value: n };
}

const Sessions = () => {
  const navigate = useNavigate();
  const { data, isLoading } = useAdminSessionsList();
  const { canEdit } = useAdminAccess();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportAssessmentsToExcel();
      toast.success("Export ready", { description: "Excel file downloaded." });
    } catch (err) {
      toast.error("Export failed", {
        description: err instanceof Error ? err.message : "Unknown error",
      });
    } finally {
      setExporting(false);
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data ?? []).filter((s) => {
      // "all" includes deleted snapshots so admins immediately see what's
      // gone; the other status filters target live sessions only.
      if (statusFilter === "deleted" && !s.deleted_at) return false;
      if (statusFilter === "completed" && (s.deleted_at || !(s.completed || s.status === "completed"))) return false;
      if (statusFilter === "in_progress" && (s.deleted_at || s.completed || s.status !== "in_progress")) return false;
      if (!q) return true;
      return (
        s.session_id.toLowerCase().includes(q) ||
        s.taxpayer_name.toLowerCase().includes(q) ||
        (s.entity_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [data, search, statusFilter]);

  const deletedCount = useMemo(
    () => (data ?? []).filter((s) => s.deleted_at).length,
    [data]
  );

  // Booked = sold fees; Pipeline = fees entered but not yet sold. Computed over
  // the currently visible (filtered) live sessions so the totals track search
  // and status filters. Deleted snapshots carry no commercial data.
  const totals = useMemo(() => {
    const live = filtered.filter((s) => !s.deleted_at);
    let booked = 0, pipeline = 0, soldCount = 0, openCount = 0;
    for (const s of live) {
      if (s.sold) {
        booked += s.revenue_eur ?? 0;
        soldCount += 1;
      } else if (s.revenue_eur != null) {
        pipeline += s.revenue_eur;
        openCount += 1;
      }
    }
    return { booked, pipeline, soldCount, openCount, hasLive: live.length > 0 };
  }, [filtered]);

  const deleteSession = useDeleteAdminSession();
  const purgeLogEntry = usePurgeAdminLogEntry();

  const handleDelete = (row: AdminSessionRow) => {
    if (row.deleted_at) {
      purgeLogEntry.mutate(row.id);
    } else {
      deleteSession.mutate(row.id);
    }
  };

  return (
    <main>
      <Seo title="Admin Sessions" description="Manage ATAD2 sessions" canonical="/admin/sessions" />
      <div className="flex items-end justify-between mb-4">
        <div>
          <div className="text-[11px] font-normal uppercase tracking-[0.16em] text-ds-ink-secondary mb-1">Admin</div>
          <h1 className="text-2xl font-normal tracking-tight">Sessions</h1>
          <p className="mt-1 text-sm text-ds-ink-secondary">Every assessment across the platform, with booked and pipeline fees.</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={handleExport}
          disabled={exporting}
        >
          <Download className="size-4 mr-2" />
          {exporting ? "Exporting…" : "Export to Excel"}
        </Button>
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
              <SelectItem value="deleted">
                Deleted{deletedCount > 0 ? ` (${deletedCount})` : ""}
              </SelectItem>
            </SelectContent>
          </Select>
        }
      />

      {!isLoading && totals.hasLive && (
        <div className="mb-4 flex items-stretch overflow-hidden rounded-[14px] border border-ds-hairline bg-ds-card">
          <SummaryStat
            label="Booked"
            amount={totals.booked}
            count={totals.soldCount}
            countLabel="sold"
            tone="booked"
          />
          <div className="w-px bg-ds-hairline" />
          <SummaryStat
            label="Pipeline"
            amount={totals.pipeline}
            count={totals.openCount}
            countLabel="open"
            tone="pipeline"
          />
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              canEdit={canEdit}
              onOpen={
                s.deleted_at
                  ? undefined
                  : () => navigate(`/admin/sessions/${s.session_id}`)
              }
              onDelete={() => handleDelete(s)}
            />
          ))}
          {filtered.length === 0 && (
            <div className="text-center text-muted-foreground py-8">No sessions match the current search and filters.</div>
          )}
        </div>
      )}

    </main>
  );
};

function SummaryStat({
  label, amount, count, countLabel, tone,
}: {
  label: string;
  amount: number;
  count: number;
  countLabel: string;
  tone: "booked" | "pipeline";
}) {
  return (
    <div className="flex-1 px-5 py-3.5">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-block size-1.5 rounded-full",
            tone === "booked" ? "bg-ds-green" : "bg-ds-ink-tertiary"
          )}
        />
        <span className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground font-normal">
          {label}
        </span>
      </div>
      <div className="mt-1.5 text-2xl font-normal tracking-tight tabular-nums text-foreground">
        {formatEur(amount)}
      </div>
      <div className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">
        {count} {countLabel}
      </div>
    </div>
  );
}

function SessionRow({
  session,
  canEdit,
  onOpen,
  onDelete,
}: {
  session: AdminSessionRow;
  canEdit: boolean;
  onOpen?: () => void;
  onDelete: () => void;
}) {
  const completed = Boolean(session.completed || session.status === "completed");
  const isDeleted = !!session.deleted_at;
  return (
    <AdminCard
      interactive={!isDeleted}
      onClick={onOpen}
      className={
        isDeleted
          ? "flex items-center gap-4 py-3 opacity-60"
          : "flex items-center gap-4 py-3 transition-all duration-normal ease-emphasized hover:shadow-sm hover:border-foreground/20"
      }
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={
            isDeleted
              ? "text-[13px] font-normal truncate line-through"
              : "text-[13px] font-normal truncate"
          }>{taxpayerDisplayName(session.taxpayer_name)}</span>
          {session.entity_name && (
            <span className="text-[11px] text-muted-foreground truncate">· {session.entity_name}</span>
          )}
        </div>
        <div className="text-[11px] text-muted-foreground truncate mt-0.5">
          FY <span className="font-mono">{formatFiscalYears(session.fiscal_year)}</span>
          {session.owner && (
            <> · {session.owner.full_name ?? session.owner.email}</>
          )}
          {isDeleted && session.deleted_at && (
            <> · deleted {new Date(session.deleted_at).toLocaleString()}</>
          )}
        </div>
      </div>
      {isDeleted ? (
        <StatusChip label="Deleted" tone="danger" />
      ) : (
        <StatusChip label={completed ? "Completed" : session.status} tone={statusTone(session.status, session.completed)} />
      )}
      {!isDeleted && session.final_score != null && (
        <StatusChip label={`Score ${session.final_score.toFixed(1)}`} tone={scoreTone(session.final_score)} />
      )}
      {!isDeleted && <RevenueCell session={session} canEdit={canEdit} />}
      <div className="font-mono text-xs text-muted-foreground whitespace-nowrap w-[120px] text-right">
        {new Date(session.created_at).toLocaleDateString()}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 text-muted-foreground hover:text-destructive"
        title={isDeleted ? "Purge audit log entry" : "Delete assessment"}
        onClick={(e) => {
          e.stopPropagation();
          onDelete();
        }}
      >
        <Trash2 className="size-4" />
      </Button>
    </AdminCard>
  );
}

function RevenuePill({
  sold, revenue,
}: {
  sold: boolean;
  revenue: number | null;
}) {
  // Booked (sold): solid green with a check, real booked revenue. Open (quote,
  // not yet sold): neutral dashed outline to signal "potential, not booked".
  if (sold) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-ds-green-bg px-2 py-0.5 text-xs font-normal text-ds-green-text tabular-nums">
        <Check className="size-3" />
        {revenue != null ? formatEur(revenue) : "Sold"}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-md border border-dashed border-ds-hairline bg-ds-fill-muted px-2 py-0.5 text-xs font-normal text-ds-ink-secondary tabular-nums">
      {revenue != null ? formatEur(revenue) : ""}
    </span>
  );
}

function RevenueCell({
  session,
  canEdit,
}: {
  session: AdminSessionRow;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [sold, setSold] = useState(session.sold);
  const [amountStr, setAmountStr] = useState(
    session.revenue_eur != null ? String(session.revenue_eur) : ""
  );
  const setRevenue = useSetSessionRevenue();

  const hasValue = session.sold || session.revenue_eur != null;

  const seedFromRow = () => {
    setSold(session.sold);
    setAmountStr(session.revenue_eur != null ? String(session.revenue_eur) : "");
  };

  const { valid: amountValid, value: parsedAmount } = useMemo(
    () => parseFee(amountStr),
    [amountStr]
  );

  const save = (next: { sold: boolean; revenueEur: number | null }) => {
    setRevenue.mutate(
      { sessionId: session.session_id, ...next },
      { onSuccess: () => setOpen(false) }
    );
  };

  // Read-only for moderators: show the value (if any), no editor.
  if (!canEdit) {
    return (
      <div className="w-[150px] flex justify-end">
        {hasValue ? <RevenuePill sold={session.sold} revenue={session.revenue_eur} /> : null}
      </div>
    );
  }

  return (
    <div className="w-[150px] flex justify-end" onClick={(e) => e.stopPropagation()}>
      <Popover
        open={open}
        onOpenChange={(o) => {
          if (o) seedFromRow();
          setOpen(o);
        }}
      >
        <PopoverTrigger asChild>
          <button
            type="button"
            onClick={(e) => e.stopPropagation()}
            className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            title={hasValue ? "Edit revenue" : "Record revenue"}
          >
            {hasValue ? (
              <RevenuePill sold={session.sold} revenue={session.revenue_eur} />
            ) : (
              <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-normal text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
                <Plus className="size-3" />
                Fee
              </span>
            )}
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="end"
          className="w-64"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-normal leading-none">Mark as sold</div>
                <div className="mt-1 text-[11px] text-muted-foreground">Engagement booked with the client</div>
              </div>
              <Switch checked={sold} onCheckedChange={setSold} aria-label="Mark as sold" />
            </div>

            <div>
              <label
                htmlFor={`fee-${session.id}`}
                className="text-[11px] font-normal text-muted-foreground"
              >
                Fee (EUR)
              </label>
              <div
                className={cn(
                  "mt-1 flex items-center rounded-md border focus-within:ring-1",
                  amountValid
                    ? "border-input focus-within:ring-ring"
                    : "border-destructive focus-within:ring-destructive"
                )}
              >
                <span className="pl-3 pr-1.5 text-sm text-muted-foreground">EUR</span>
                <input
                  id={`fee-${session.id}`}
                  inputMode="decimal"
                  value={amountStr}
                  aria-invalid={!amountValid}
                  onChange={(e) => setAmountStr(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && amountValid) {
                      e.preventDefault();
                      save({ sold, revenueEur: parsedAmount });
                    }
                  }}
                  placeholder="0"
                  autoFocus
                  className="h-9 flex-1 bg-transparent pr-3 text-sm outline-none tabular-nums placeholder:text-muted-foreground"
                />
              </div>
              <p
                className={cn(
                  "mt-1 text-[11px]",
                  amountValid ? "text-muted-foreground" : "text-destructive"
                )}
              >
                {amountValid
                  ? "Enter the fee any time; flip Sold once it is booked."
                  : "Enter a number like 1000 or 1000.50."}
              </p>
            </div>

            <div className="flex items-center justify-between gap-2 pt-1">
              {hasValue ? (
                <button
                  type="button"
                  onClick={() => save({ sold: false, revenueEur: null })}
                  disabled={setRevenue.isPending}
                  className="text-xs text-muted-foreground transition-colors hover:text-destructive disabled:opacity-50"
                >
                  Clear
                </button>
              ) : (
                <span />
              )}
              <Button
                size="sm"
                onClick={() => save({ sold, revenueEur: parsedAmount })}
                disabled={setRevenue.isPending || !amountValid}
              >
                {setRevenue.isPending ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export default Sessions;
