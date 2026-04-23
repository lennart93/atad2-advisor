import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Seo } from "@/components/Seo";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { AdminCard } from "@/components/admin/AdminCard";
import { SlideInPanel } from "@/components/admin/SlideInPanel";
import { supabase } from "@/integrations/supabase/client";

const TABLES = [
  { key: "atad2_sessions", label: "Sessions" },
  { key: "atad2_answers", label: "Answers" },
  { key: "atad2_questions", label: "Questions" },
  { key: "atad2_context_questions", label: "Context questions" },
  { key: "atad2_reports", label: "Reports" },
  { key: "profiles", label: "Profiles" },
  { key: "user_roles", label: "User roles" },
  { key: "audit_logs", label: "Audit logs" },
] as const;

type TableKey = typeof TABLES[number]["key"];

type RowShape = Record<string, unknown>;

const PAGE_SIZE = 50;

const DataExplorer = () => {
  const [table, setTable] = useState<TableKey>("atad2_sessions");
  const [page, setPage] = useState(0);
  const [selectedRow, setSelectedRow] = useState<RowShape | null>(null);

  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["explorer", table, page],
    queryFn: async () => {
      const { data, error, count } = await supabase
        .from(table)
        .select("*", { count: "exact" })
        .order("created_at", { ascending: false, nullsFirst: false })
        .range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as RowShape[], total: count ?? 0 };
    },
  });

  const columns = useMemo(() => {
    if (!data?.rows.length) return [] as string[];
    return Object.keys(data.rows[0]);
  }, [data]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  return (
    <main>
      <Seo title="Admin Data Explorer" description="Read-only browser for Supabase tables" canonical="/admin/explorer" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-[22px] font-bold">Data Explorer</h1>
      </div>

      <div className="flex items-center gap-3 mb-4">
        <Select
          value={table}
          onValueChange={(v) => {
            setTable(v as TableKey);
            setPage(0);
          }}
        >
          <SelectTrigger className="w-[220px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TABLES.map((t) => (
              <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-[11px] text-muted-foreground">
          {data ? `${data.total.toLocaleString()} rows` : "—"} · read-only
        </span>
      </div>

      {isLoading ? (
        <div className="space-y-1.5">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : !data || data.rows.length === 0 ? (
        <AdminCard>
          <div className="text-muted-foreground text-[13px]">No rows in {table}.</div>
        </AdminCard>
      ) : (
        <>
          <AdminCard className="overflow-x-auto p-0">
            <table className="w-full text-[12px]">
              <thead className="bg-muted/40">
                <tr>
                  {columns.slice(0, 8).map((col) => (
                    <th key={col} className="text-left px-3 py-2 font-semibold text-muted-foreground">
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => (
                  <tr
                    key={i}
                    onClick={() => setSelectedRow(row)}
                    className="cursor-pointer border-t border-[#ececec] hover:bg-muted/30"
                  >
                    {columns.slice(0, 8).map((col) => (
                      <td key={col} className="px-3 py-2 truncate max-w-[220px]">
                        {formatCell(row[col])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </AdminCard>

          <div className="flex items-center justify-between mt-3 text-[12px] text-muted-foreground">
            <div>
              Page {page + 1} of {totalPages}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0 || isFetching}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Input
                type="number"
                value={page + 1}
                min={1}
                max={totalPages}
                onChange={(e) => {
                  const v = Math.max(1, Math.min(totalPages, Number(e.target.value) || 1));
                  setPage(v - 1);
                }}
                className="h-8 w-16 text-center"
              />
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1 || isFetching}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      )}

      <SlideInPanel
        open={selectedRow !== null}
        onClose={() => setSelectedRow(null)}
        title={`${table} row`}
        subtitle="Read-only"
        width={560}
      >
        {selectedRow && (
          <pre className="text-[11px] font-mono whitespace-pre-wrap break-all bg-muted/40 p-3 rounded-md">
            {JSON.stringify(selectedRow, null, 2)}
          </pre>
        )}
      </SlideInPanel>
    </main>
  );
};

function formatCell(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v).slice(0, 60);
  if (typeof v === "boolean") return v ? "true" : "false";
  const s = String(v);
  return s.length > 60 ? s.slice(0, 60) + "…" : s;
}

export default DataExplorer;
