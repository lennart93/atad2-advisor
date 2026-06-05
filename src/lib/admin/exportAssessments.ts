import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type LogRow = Database["public"]["Tables"]["atad2_assessment_log"]["Row"];

function toExcelDate(v: string | null): Date | null {
  if (!v) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export async function exportAssessmentsToExcel(): Promise<void> {
  const { Workbook } = await import("exceljs");

  const { data, error } = await supabase
    .from("atad2_assessment_log")
    .select("*")
    .order("event_at", { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as LogRow[];

  // Commercial tracking lives on the live sessions table (not the log), so
  // pull sold/revenue and merge by session_id into the assessment export.
  const { data: revenueRows } = await supabase
    .from("atad2_sessions")
    .select("session_id, sold, revenue_eur");
  const revenueBySession = new Map<string, { sold: boolean; revenue_eur: number | null }>();
  for (const r of revenueRows ?? []) {
    revenueBySession.set(r.session_id, { sold: r.sold, revenue_eur: r.revenue_eur });
  }

  // Latest snapshot per session_id (rows are already DESC by event_at)
  const latestPerSession = new Map<string, LogRow>();
  for (const r of rows) {
    if (!latestPerSession.has(r.session_id)) latestPerSession.set(r.session_id, r);
  }

  const wb = new Workbook();
  wb.creator = "ATAD2 Advisor";
  wb.created = new Date();

  const assessments = wb.addWorksheet("Assessments");
  assessments.columns = [
    { header: "Session ID",          key: "session_id",           width: 26 },
    { header: "Taxpayer",            key: "taxpayer_name",        width: 30 },
    { header: "Entity",              key: "entity_name",          width: 24 },
    { header: "Fiscal year",         key: "fiscal_year",          width: 12 },
    { header: "User",                key: "user_full_name",       width: 24 },
    { header: "User email",          key: "user_email",           width: 30 },
    { header: "Status",              key: "status",               width: 14 },
    { header: "Final score",         key: "final_score",          width: 12 },
    { header: "Sold",                key: "sold",                 width: 8 },
    { header: "Amount (EUR)",        key: "revenue_eur",          width: 14 },
    { header: "Preliminary outcome", key: "preliminary_outcome",  width: 22 },
    { header: "Confirmed",           key: "outcome_confirmed",    width: 12 },
    { header: "Created at",          key: "session_created_at",   width: 22 },
    { header: "Completed at",        key: "confirmed_at",         width: 22 },
    { header: "Latest event",        key: "event_type",           width: 14 },
    { header: "Latest event at",     key: "event_at",             width: 22 },
  ];
  for (const r of Array.from(latestPerSession.values()).sort((a, b) =>
    (a.session_created_at ?? "").localeCompare(b.session_created_at ?? "")
  )) {
    const rev = revenueBySession.get(r.session_id);
    assessments.addRow({
      session_id: r.session_id,
      taxpayer_name: r.taxpayer_name,
      entity_name: r.entity_name,
      fiscal_year: r.fiscal_year,
      user_full_name: r.user_full_name,
      user_email: r.user_email,
      status: r.status,
      final_score: r.final_score,
      sold: rev?.sold ? "Yes" : "",
      revenue_eur: rev?.revenue_eur ?? null,
      preliminary_outcome: r.preliminary_outcome,
      outcome_confirmed: r.outcome_confirmed,
      session_created_at: toExcelDate(r.session_created_at),
      confirmed_at: toExcelDate(r.confirmed_at),
      event_type: r.event_type,
      event_at: toExcelDate(r.event_at),
    });
  }
  assessments.getRow(1).font = { bold: true };
  assessments.views = [{ state: "frozen", ySplit: 1 }];

  const activity = wb.addWorksheet("Activity log");
  activity.columns = [
    { header: "Event at",     key: "event_at",         width: 22 },
    { header: "Event",        key: "event_type",       width: 14 },
    { header: "Session ID",   key: "session_id",       width: 26 },
    { header: "Taxpayer",     key: "taxpayer_name",    width: 30 },
    { header: "Fiscal year",  key: "fiscal_year",      width: 12 },
    { header: "User",         key: "user_full_name",   width: 24 },
    { header: "User email",   key: "user_email",       width: 30 },
    { header: "Status",       key: "status",           width: 14 },
    { header: "Final score",  key: "final_score",      width: 12 },
  ];
  for (const r of rows) {
    activity.addRow({
      event_at: toExcelDate(r.event_at),
      event_type: r.event_type,
      session_id: r.session_id,
      taxpayer_name: r.taxpayer_name,
      fiscal_year: r.fiscal_year,
      user_full_name: r.user_full_name,
      user_email: r.user_email,
      status: r.status,
      final_score: r.final_score,
    });
  }
  activity.getRow(1).font = { bold: true };
  activity.views = [{ state: "frozen", ySplit: 1 }];

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const stamp = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `atad2-assessments-${stamp}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
