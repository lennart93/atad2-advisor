import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Props {
  promptKey: string;
  onClose: () => void;
}

export function PrefillPromptHistory({ promptKey, onClose }: Props) {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["prefill-prompt-history", promptKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_prompts")
        .select("id, version, is_active, notes, created_at")
        .eq("key", promptKey)
        .order("version", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const activate = async (id: string) => {
    try {
      await supabase.from("atad2_prompts").update({ is_active: false }).eq("key", promptKey).eq("is_active", true);
      const { error } = await supabase.from("atad2_prompts").update({ is_active: true }).eq("id", id);
      if (error) throw error;
      await qc.invalidateQueries({ queryKey: ["prefill-prompt-history", promptKey] });
      await qc.invalidateQueries({ queryKey: ["admin-prompts-active"] });
      toast({ title: "Activated" });
    } catch (e) {
      toast({ title: "Failed to activate", description: String(e), variant: "destructive" });
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Version history: {promptKey}</DialogTitle></DialogHeader>
        <div className="space-y-2 max-h-[70vh] overflow-auto">
          {(data ?? []).map((v) => (
            <div key={v.id} className="flex items-start justify-between gap-3 border rounded p-3">
              <div className="flex-1 min-w-0">
                <div className="text-sm">
                  <strong>v{v.version}</strong>
                  {v.is_active && <span className="ml-2 text-xs bg-ds-fill-muted text-ds-ink px-2 py-0.5 rounded">active</span>}
                </div>
                <div className="text-xs text-muted-foreground">{new Date(v.created_at).toLocaleString()}</div>
                {v.notes && <div className="text-xs mt-1">{v.notes}</div>}
              </div>
              {!v.is_active && <Button size="sm" onClick={() => activate(v.id)}>Activate</Button>}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
