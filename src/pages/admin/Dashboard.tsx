import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  FileText, Star, FileCheck, Users, CheckSquare, HelpCircle,
  MessageSquare, BarChart3, Database, AlertCircle, LucideIcon,
} from "lucide-react";
import { Seo } from "@/components/Seo";
import { supabase } from "@/integrations/supabase/client";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AdminCard } from "@/components/admin/AdminCard";
import { IconChip } from "@/components/admin/IconChip";
import { KpiCard } from "@/components/admin/KpiCard";
import type { EntityKey } from "@/components/admin/entityColors";

type Period = "24h" | "7d" | "30d" | "90d";

const PERIOD_LABELS: Record<Period, string> = {
  "24h": "Last 24 hours",
  "7d":  "Last 7 days",
  "30d": "Last 30 days",
  "90d": "Last 90 days",
};

function periodToDate(p: Period): Date {
  const d = new Date();
  switch (p) {
    case "24h": d.setHours(d.getHours() - 24); break;
    case "7d":  d.setDate(d.getDate() - 7); break;
    case "30d": d.setDate(d.getDate() - 30); break;
    case "90d": d.setDate(d.getDate() - 90); break;
  }
  return d;
}

const SHORTCUTS: Array<{ title: string; url: string; entity: EntityKey; icon: LucideIcon; sub: string }> = [
  { title: "Sessions",          url: "/admin/sessions",          entity: "sessions",         icon: FileText,      sub: "View all assessments" },
  { title: "Users",             url: "/admin/users",             entity: "users",            icon: Users,         sub: "Accounts & roles" },
  { title: "Questions",         url: "/admin/questions",         entity: "questions",        icon: CheckSquare,   sub: "ATAD2 questionnaire" },
  { title: "Context questions", url: "/admin/context-questions", entity: "contextQuestions", icon: HelpCircle,    sub: "Follow-up questions" },
  { title: "Feedback",          url: "/admin/audit",             entity: "feedback",         icon: MessageSquare, sub: "User comments" },
  { title: "Data Explorer",     url: "/admin/explorer",          entity: "explorer",         icon: Database,      sub: "Browse tables" },
  { title: "Analytics",         url: "/admin/analytics",         entity: "analytics",        icon: BarChart3,     sub: "Trends & insights" },
  { title: "Audit Log",         url: "/admin/audit",             entity: "audit",            icon: AlertCircle,   sub: "Security events" },
];

const Dashboard = () => {
  const [period, setPeriod] = useState<Period>("7d");
  const since = periodToDate(period).toISOString();

  const { data: sessionStats } = useQuery({
    queryKey: ["hub-session-stats", period],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("atad2_sessions")
        .select("id", { count: "exact", head: true })
        .gte("created_at", since);
      if (error) throw error;
      return { total: count ?? 0 };
    },
  });

  const { data: scoreStats } = useQuery({
    queryKey: ["hub-score", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_sessions")
        .select("final_score")
        .gte("created_at", since)
        .not("final_score", "is", null);
      if (error) throw error;
      const vals = (data ?? [])
        .map((r) => r.final_score)
        .filter((n): n is number => typeof n === "number");
      const avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
      return { avg };
    },
  });

  const { data: sparkline } = useQuery({
    queryKey: ["hub-sparkline", period],
    queryFn: async () => {
      const days = period === "24h" ? 1 : period === "7d" ? 7 : period === "30d" ? 30 : 90;
      const { data, error } = await supabase
        .from("atad2_sessions")
        .select("created_at")
        .gte("created_at", since);
      if (error) throw error;
      const buckets = new Array(Math.max(days, 2)).fill(0);
      const now = Date.now();
      (data ?? []).forEach((row) => {
        const t = new Date(row.created_at).getTime();
        const ageDays = Math.floor((now - t) / 86_400_000);
        const idx = Math.min(buckets.length - 1, Math.max(0, buckets.length - 1 - ageDays));
        buckets[idx]++;
      });
      return buckets;
    },
  });

  const { data: reportStats } = useQuery({
    queryKey: ["hub-report-stats", period],
    queryFn: async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [totalRes, todayRes] = await Promise.all([
        supabase
          .from("atad2_reports")
          .select("id", { count: "exact", head: true })
          .gte("created_at", since),
        supabase
          .from("atad2_reports")
          .select("id", { count: "exact", head: true })
          .gte("created_at", todayStart.toISOString()),
      ]);
      if (totalRes.error) throw totalRes.error;
      return {
        total: totalRes.count ?? 0,
        today: todayRes.count ?? 0,
      };
    },
  });

  return (
    <main>
      <Seo
        title="Admin Hub"
        description="ATAD2 Admin Hub"
        canonical="/admin/dashboard"
      />

      <header className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-bold text-foreground">Admin Hub</h1>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[180px] h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(PERIOD_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </header>

      <section className="mb-6">
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Key metrics
        </div>
        <div className="grid grid-cols-4 gap-3">
          <div className="col-span-2">
            <KpiCard
              entity="sessions"
              icon={FileText}
              label="Sessions"
              value={sessionStats?.total ?? "—"}
              sparkline={sparkline}
              size="lg"
            />
          </div>
          <KpiCard
            entity="settings"
            icon={Star}
            label="Avg. score"
            value={scoreStats?.avg != null ? scoreStats.avg.toFixed(1) : "—"}
            subLabel="of 10"
          />
          <KpiCard
            entity="questions"
            icon={FileCheck}
            label="Reports"
            value={reportStats?.total ?? "—"}
            subLabel={
              reportStats && reportStats.today > 0
                ? `+${reportStats.today} today`
                : undefined
            }
          />
        </div>
      </section>

      <section>
        <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
          Shortcuts
        </div>
        <div className="grid grid-cols-4 gap-3">
          {SHORTCUTS.map((s) => (
            <NavLink key={s.title} to={s.url} className="block">
              <AdminCard interactive className="flex flex-col gap-3">
                <IconChip entity={s.entity} icon={s.icon} size="md" />
                <div>
                  <div className="text-[13px] font-semibold text-foreground">{s.title}</div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{s.sub}</div>
                </div>
              </AdminCard>
            </NavLink>
          ))}
        </div>
      </section>
    </main>
  );
};

export default Dashboard;
