import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AdminCard } from "@/components/admin/AdminCard";
import { PrefillPromptEditor } from "@/components/admin/prefill/PrefillPromptEditor";
import { PrefillPromptHistory } from "@/components/admin/prefill/PrefillPromptHistory";

const KEYS = [
  { key: "prefill_swarm_system", label: "Swarm: per-question pre-fill" },
] as const;

type PromptKey = typeof KEYS[number]["key"];

export default function PrefillPrompts() {
  const [editingKey, setEditingKey] = useState<PromptKey | null>(null);
  const [historyKey, setHistoryKey] = useState<PromptKey | null>(null);

  const active = useQuery({
    queryKey: ["prefill-prompts-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_prompts")
        .select("key, version, system_prompt, created_at")
        .eq("is_active", true);
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <main>
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">Admin</div>
          <h1 className="text-2xl font-semibold tracking-tight">Pre-Fill Prompts</h1>
        </div>
      </div>

      <div className="space-y-3">
        {KEYS.map(({ key, label }) => {
          const row = active.data?.find((r) => r.key === key);
          return (
            <AdminCard
              key={key}
              className="transition-all duration-normal ease-emphasized hover:shadow-sm hover:border-foreground/20"
            >
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="min-w-0">
                  <div className="text-[13px] font-semibold text-foreground truncate">{label}</div>
                  <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2">
                    <span>Active version</span>
                    <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-foreground">
                      v{row?.version ?? "—"}
                    </span>
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button
                    size="sm"
                    onClick={() => setEditingKey(key)}
                    className="transition-colors duration-fast"
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setHistoryKey(key)}
                    className="transition-colors duration-fast"
                  >
                    Version history
                  </Button>
                </div>
              </div>
              <pre className="bg-muted/40 border border-border p-3 rounded-md text-xs font-mono whitespace-pre-wrap max-h-40 overflow-auto text-muted-foreground">
                {row?.system_prompt?.slice(0, 400) ?? "—"}
                {row && row.system_prompt.length > 400 ? "…" : ""}
              </pre>
            </AdminCard>
          );
        })}
      </div>

      {editingKey && (
        <PrefillPromptEditor
          promptKey={editingKey}
          onClose={() => { setEditingKey(null); active.refetch(); }}
        />
      )}
      {historyKey && (
        <PrefillPromptHistory
          promptKey={historyKey}
          onClose={() => { setHistoryKey(null); active.refetch(); }}
        />
      )}
    </main>
  );
}
