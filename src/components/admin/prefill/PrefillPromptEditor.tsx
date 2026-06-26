import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

interface Props {
  promptKey: string;
  placeholdersHint?: string;
  /** Pre-fill the system prompt (e.g. a Prompt Tuner suggestion). Model,
   *  temperature, max tokens and template still load from the active version. */
  initialSystemPrompt?: string;
  /** Pre-fill the (required) change notes. */
  initialNotes?: string;
  onClose: () => void;
}

export function PrefillPromptEditor({ promptKey, placeholdersHint, initialSystemPrompt, initialNotes, onClose }: Props) {
  const [systemPrompt, setSystemPrompt] = useState("");
  const [template, setTemplate] = useState("");
  const [model, setModel] = useState("claude-opus-4-7");
  const [temperature, setTemperature] = useState(0);
  const [maxTokens, setMaxTokens] = useState(8000);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("atad2_prompts")
        .select("system_prompt, user_prompt_template, model, temperature, max_tokens")
        .eq("key", promptKey)
        .eq("is_active", true)
        .maybeSingle();
      if (cancelled) return;
      if (data) {
        setSystemPrompt(data.system_prompt);
        setTemplate(data.user_prompt_template ?? "");
        setModel(data.model);
        setTemperature(Number(data.temperature));
        setMaxTokens(data.max_tokens);
      }
      // Prompt Tuner draft: override the system prompt and notes with the
      // proposed text, while keeping model/temperature/template from the
      // active version above.
      if (initialSystemPrompt !== undefined) setSystemPrompt(initialSystemPrompt);
      if (initialNotes !== undefined) setNotes(initialNotes);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [promptKey, initialSystemPrompt, initialNotes]);

  const save = async () => {
    if (!notes.trim()) {
      toast({ title: "Notes required", description: "Describe what changed and why.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("atad2_prompts")
        .select("version")
        .eq("key", promptKey)
        .order("version", { ascending: false })
        .limit(1);
      const nextVersion = ((existing?.[0] as { version: number } | undefined)?.version ?? 0) + 1;

      const { data: user } = await supabase.auth.getUser();

      const { error } = await supabase.from("atad2_prompts").insert({
        key: promptKey,
        version: nextVersion,
        system_prompt: systemPrompt,
        user_prompt_template: template,
        model,
        temperature,
        max_tokens: maxTokens,
        is_active: false,
        notes,
        created_by: user.user?.id ?? null,
      });
      if (error) throw error;

      toast({ title: "Saved new version", description: `v${nextVersion} saved as inactive. Activate from the history view.` });
      onClose();
    } catch (e) {
      toast({ title: "Save failed", description: String(e), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-auto">
        <DialogHeader><DialogTitle>Edit {promptKey}</DialogTitle></DialogHeader>
        {loading ? <div>Loading…</div> : (
          <div className="space-y-4">
            <div>
              <Label>System prompt</Label>
              <Textarea rows={20} className="font-mono text-xs" value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
            </div>
            <div>
              <Label>User prompt template</Label>
              <Textarea rows={6} className="font-mono text-xs" value={template} onChange={(e) => setTemplate(e.target.value)} />
              {placeholdersHint && (
                <p className="text-xs text-muted-foreground mt-1">
                  Placeholders: {placeholdersHint}
                </p>
              )}
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div><Label>Model</Label><Input value={model} onChange={(e) => setModel(e.target.value)} /></div>
              <div><Label>Temperature</Label><Input type="number" step="0.01" min="0" max="1" value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} /></div>
              <div><Label>Max tokens</Label><Input type="number" value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} /></div>
            </div>
            <div>
              <Label>Notes (required)</Label>
              <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What changed and why?" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button disabled={saving} onClick={save}>Save as new version</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
