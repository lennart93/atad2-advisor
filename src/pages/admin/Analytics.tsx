import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import { Seo } from "@/components/Seo";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { AdminCard } from "@/components/admin/AdminCard";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

type Period = "30d" | "90d" | "365d";

const PERIOD_LABELS: Record<Period, string> = {
  "30d": "Last 30 days",
  "90d": "Last 90 days",
  "365d": "Last year",
};

function periodToDays(p: Period): number {
  return p === "30d" ? 30 : p === "90d" ? 90 : 365;
}

function periodToDate(p: Period): Date {
  const d = new Date();
  d.setDate(d.getDate() - periodToDays(p));
  d.setHours(0, 0, 0, 0);
  return d;
}

function bucketByWeek(items: { created_at: string }[], days: number) {
  const weeks = Math.max(1, Math.ceil(days / 7));
  const now = Date.now();
  const start = now - days * 86_400_000;
  const buckets = new Array(weeks).fill(0).map((_, i) => ({
    label: `W-${weeks - i}`,
    count: 0,
    start: start + i * 7 * 86_400_000,
  }));
  items.forEach((row) => {
    const t = new Date(row.created_at).getTime();
    const idx = Math.min(weeks - 1, Math.max(0, Math.floor((t - start) / (7 * 86_400_000))));
    buckets[idx].count++;
  });
  return buckets;
}

function bucketByMonth(items: { created_at: string; final_score: number | null }[], days: number) {
  const map = new Map<string, { sum: number; count: number }>();
  const cutoff = Date.now() - days * 86_400_000;
  items.forEach((row) => {
    const t = new Date(row.created_at).getTime();
    if (t < cutoff) return;
    if (row.final_score == null) return;
    const d = new Date(row.created_at);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const entry = map.get(key) ?? { sum: 0, count: 0 };
    entry.sum += row.final_score;
    entry.count += 1;
    map.set(key, entry);
  });
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, v]) => ({ label, avg: v.count ? v.sum / v.count : 0 }));
}

const Analytics = () => {
  const [period, setPeriod] = useState<Period>("90d");
  const days = periodToDays(period);
  const since = periodToDate(period).toISOString();

  const { data: sessions, isLoading: loadingSessions } = useQuery({
    queryKey: ["analytics-sessions", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_sessions")
        .select("created_at, final_score, status, completed")
        .gte("created_at", since);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: answers, isLoading: loadingAnswers } = useQuery({
    queryKey: ["analytics-answers", period],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_answers")
        .select("question_id, question_text, session_id, answered_at")
        .gte("answered_at", since);
      if (error) throw error;
      return data ?? [];
    },
  });

  const sessionsPerWeek = useMemo(
    () => bucketByWeek(sessions ?? [], days),
    [sessions, days]
  );

  const avgScorePerMonth = useMemo(
    () => bucketByMonth(sessions ?? [], days),
    [sessions, days]
  );

  const topQuestions = useMemo(() => {
    const counts = new Map<string, { qid: string; label: string; count: number }>();
    (answers ?? []).forEach((a) => {
      const entry = counts.get(a.question_id) ?? {
        qid: a.question_id,
        label: a.question_text?.slice(0, 60) ?? a.question_id,
        count: 0,
      };
      entry.count++;
      counts.set(a.question_id, entry);
    });
    return Array.from(counts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [answers]);

  const completionRate = useMemo(() => {
    if (!sessions || sessions.length === 0) return null;
    const completed = sessions.filter((s) => s.completed || s.status === "completed").length;
    return (completed / sessions.length) * 100;
  }, [sessions]);

  return (
    <main>
      <Seo title="Admin Analytics" description="Trends and insights for ATAD2" canonical="/admin/analytics" />
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[22px] font-bold">Analytics</h1>
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
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <AdminCard>
          <div className="text-[11px] text-muted-foreground font-medium mb-1">Total sessions</div>
          <div className="text-[24px] font-bold">
            {loadingSessions ? "—" : (sessions?.length ?? 0)}
          </div>
        </AdminCard>
        <AdminCard>
          <div className="text-[11px] text-muted-foreground font-medium mb-1">Completion rate</div>
          <div className="text-[24px] font-bold">
            {loadingSessions || completionRate == null ? "—" : `${completionRate.toFixed(0)}%`}
          </div>
        </AdminCard>
        <AdminCard>
          <div className="text-[11px] text-muted-foreground font-medium mb-1">Answers recorded</div>
          <div className="text-[24px] font-bold">
            {loadingAnswers ? "—" : (answers?.length ?? 0)}
          </div>
        </AdminCard>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <AdminCard>
          <div className="text-[13px] font-semibold mb-3">Sessions per week</div>
          {loadingSessions ? (
            <Skeleton className="h-52 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={sessionsPerWeek}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="label" stroke="#9ca3af" fontSize={11} />
                <YAxis stroke="#9ca3af" fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="count" stroke="#374151" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </AdminCard>

        <AdminCard>
          <div className="text-[13px] font-semibold mb-3">Average score per month</div>
          {loadingSessions ? (
            <Skeleton className="h-52 w-full" />
          ) : avgScorePerMonth.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center text-muted-foreground text-[13px]">
              Not enough scored sessions.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={avgScorePerMonth}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="label" stroke="#9ca3af" fontSize={11} />
                <YAxis stroke="#9ca3af" fontSize={11} domain={[0, 10]} />
                <Tooltip contentStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="avg" stroke="#374151" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </AdminCard>
      </div>

      <AdminCard className="mt-3">
        <div className="text-[13px] font-semibold mb-3">Most-answered questions (top 10)</div>
        {loadingAnswers ? (
          <Skeleton className="h-60 w-full" />
        ) : topQuestions.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center text-muted-foreground text-[13px]">
            No answers in this period.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(220, topQuestions.length * 28)}>
            <BarChart data={topQuestions} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis type="number" stroke="#9ca3af" fontSize={11} allowDecimals={false} />
              <YAxis
                type="category"
                dataKey="qid"
                stroke="#9ca3af"
                fontSize={11}
                width={60}
              />
              <Tooltip
                contentStyle={{ fontSize: 12 }}
                labelFormatter={(val) => {
                  const item = topQuestions.find((q) => q.qid === val);
                  return item?.label ?? val;
                }}
              />
              <Bar dataKey="count" fill="#374151" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </AdminCard>
    </main>
  );
};

export default Analytics;
