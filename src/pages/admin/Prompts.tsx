import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import { Seo } from "@/components/Seo";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { AdminCard } from "@/components/admin/AdminCard";
import { StatusChip } from "@/components/admin/StatChip";
import { PrefillPromptEditor } from "@/components/admin/prefill/PrefillPromptEditor";
import { PrefillPromptHistory } from "@/components/admin/prefill/PrefillPromptHistory";
import {
  PROMPT_DESCRIPTORS, PROMPT_GROUPS, EXTERNAL_PROMPTS, type PromptKey, type PromptDescriptor,
} from "@/lib/admin/promptKeys";

interface ActiveRow {
  key: string;
  version: number;
  system_prompt: string;
  created_at: string;
}

export default function Prompts() {
  const [editing, setEditing] = useState<PromptDescriptor | null>(null);
  const [historyKey, setHistoryKey] = useState<PromptKey | null>(null);

  const active = useQuery({
    queryKey: ["admin-prompts-active"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_prompts")
        .select("key, version, system_prompt, created_at")
        .eq("is_active", true);
      if (error) throw error;
      return (data ?? []) as ActiveRow[];
    },
  });

  const rowFor = (key: string) => active.data?.find((r) => r.key === key);

  return (
    <main>
      <Seo title="Admin Prompts" description="Manage all editable prompts" canonical="/admin/prompts" />
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">Admin</div>
          <h1 className="text-2xl font-semibold tracking-tight">Prompts</h1>
        </div>
      </div>

      {PROMPT_GROUPS.map((group) => {
        const items = PROMPT_DESCRIPTORS.filter((d) => d.group === group);
        if (items.length === 0) return null;
        return (
          <section key={group} className="mb-6">
            <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium mb-2">
              {group}
            </div>
            <div className="space-y-3">
              {items.map((d) => {
                const row = rowFor(d.key);
                return (
                  <AdminCard
                    key={d.key}
                    className="transition-all duration-normal ease-emphasized hover:shadow-sm hover:border-foreground/20"
                  >
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div className="min-w-0">
                        <div className="text-[13px] font-semibold text-foreground truncate">{d.label}</div>
                        <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-2 flex-wrap">
                          <span className="font-mono">{d.key}</span>
                          <span>·</span>
                          <span>Active version</span>
                          <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-muted text-foreground">
                            v{row?.version ?? "—"}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">{d.description}</div>
                      </div>
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => setEditing(d)}
                          disabled={!row}
                          className="transition-colors duration-fast"
                        >
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setHistoryKey(d.key)}
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
          </section>
        );
      })}

      {EXTERNAL_PROMPTS.length > 0 && (
        <section className="mb-6">
          <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground font-medium mb-2">
            External (managed outside this app)
          </div>
          <div className="space-y-3">
            {EXTERNAL_PROMPTS.map((p) => (
              <AdminCard key={p.label} className="opacity-90">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="text-[13px] font-semibold text-foreground truncate">{p.label}</div>
                      <StatusChip label="External" tone="neutral" />
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
                      <ExternalLink className="size-3" />
                      <span>{p.location}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-1">{p.description}</div>
                  </div>
                </div>
              </AdminCard>
            ))}
          </div>
        </section>
      )}

      {editing && (
        <PrefillPromptEditor
          promptKey={editing.key}
          placeholdersHint={editing.placeholders}
          onClose={() => { setEditing(null); active.refetch(); }}
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
