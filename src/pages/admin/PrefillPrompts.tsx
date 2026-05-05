import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { PrefillPromptEditor } from "@/components/admin/prefill/PrefillPromptEditor";
import { PrefillPromptHistory } from "@/components/admin/prefill/PrefillPromptHistory";

const KEYS = [
  { key: "prefill_swarm_system", label: "Swarm: per-question pre-fill (active)" },
  { key: "prefill_stage1_system", label: "Stage 1: per-document fact summary (legacy)" },
  { key: "prefill_stage2_system", label: "Stage 2: question pre-fills (legacy)" },
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
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Pre-Fill Prompts</h1>

      {KEYS.map(({ key, label }) => {
        const row = active.data?.find((r) => r.key === key);
        return (
          <Card key={key}>
            <CardHeader><CardTitle>{label}</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              <div className="text-sm">Active version: <strong>v{row?.version ?? "—"}</strong></div>
              <pre className="bg-muted p-3 rounded text-xs whitespace-pre-wrap max-h-40 overflow-auto">
                {row?.system_prompt?.slice(0, 400) ?? "—"}
                {row && row.system_prompt.length > 400 ? "…" : ""}
              </pre>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => setEditingKey(key)}>Edit</Button>
                <Button size="sm" variant="outline" onClick={() => setHistoryKey(key)}>Version history</Button>
              </div>
            </CardContent>
          </Card>
        );
      })}

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
    </div>
  );
}
