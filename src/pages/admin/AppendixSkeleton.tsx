import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, ChevronUp, ChevronDown, Save, Loader2 } from "lucide-react";
import { Seo } from "@/components/Seo";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";
import { toast } from "@/components/ui/sonner";

interface SkeletonDbRow {
  id: string;
  row_id: string;
  section_id: string;
  section_title: string;
  legal_basis: string;
  condition_tested: string;
  effect: string | null;
  kind: string | null;
  related_view: string | null;
  allowed_states: unknown;
  sort_order: number;
}

interface EditRow {
  id: string | null;
  rowId: string;
  sectionId: string;
  sectionTitle: string;
  legalBasis: string;
  conditionTested: string;
  effect: string; // '', 'D/NI', 'DD'
  kind: string; // 'gate' | 'operative'
  relatedView: string; // 'none' | 'popover' | 'inline'
  allowedStates: string; // comma-separated while editing
}

const DEFAULT_STATES = "Not triggered, Triggered, Insufficient information";

function toEdit(r: SkeletonDbRow): EditRow {
  return {
    id: r.id,
    rowId: r.row_id,
    sectionId: r.section_id,
    sectionTitle: r.section_title,
    legalBasis: r.legal_basis,
    conditionTested: r.condition_tested,
    effect: r.effect ?? "",
    kind: r.kind ?? "gate",
    relatedView: r.related_view ?? "none",
    allowedStates: (Array.isArray(r.allowed_states) ? (r.allowed_states as string[]) : []).join(", "),
  };
}

function parseStates(s: string): string[] {
  return s.split(",").map((x) => x.trim()).filter(Boolean);
}

export default function AppendixSkeleton() {
  const qc = useQueryClient();
  const [rows, setRows] = useState<EditRow[]>([]);
  const [originalIds, setOriginalIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const q = useQuery({
    queryKey: ["admin-appendix-skeleton"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_appendix_skeleton")
        .select("id, row_id, section_id, section_title, legal_basis, condition_tested, effect, kind, related_view, allowed_states, sort_order")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as SkeletonDbRow[];
    },
  });

  useEffect(() => {
    if (q.data) {
      setRows(q.data.map(toEdit));
      setOriginalIds(q.data.map((r) => r.id));
    }
  }, [q.data]);

  const update = (i: number, patch: Partial<EditRow>) =>
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const removeRow = (i: number) => setRows((prev) => prev.filter((_, idx) => idx !== i));
  const move = (i: number, dir: -1 | 1) =>
    setRows((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  const addRow = () =>
    setRows((prev) => [
      ...prev,
      {
        id: null,
        rowId: "",
        sectionId: prev[prev.length - 1]?.sectionId ?? "",
        sectionTitle: prev[prev.length - 1]?.sectionTitle ?? "",
        legalBasis: "",
        conditionTested: "",
        effect: "",
        kind: "gate",
        relatedView: "none",
        allowedStates: DEFAULT_STATES,
      },
    ]);

  const save = async () => {
    const ids = rows.map((r) => r.rowId.trim());
    if (ids.some((x) => !x)) { toast.error("Every row needs a row id (e.g. 3.2)"); return; }
    if (new Set(ids).size !== ids.length) { toast.error("Row ids must be unique"); return; }
    if (rows.some((r) => !r.legalBasis.trim())) { toast.error("Every row needs a legal basis"); return; }
    if (rows.some((r) => !r.conditionTested.trim())) { toast.error("Every row needs a condition tested"); return; }
    if (rows.some((r) => parseStates(r.allowedStates).length === 0)) { toast.error("Every row needs at least one status option"); return; }

    setSaving(true);
    try {
      const currentIds = rows.filter((r) => r.id).map((r) => r.id as string);
      const toDelete = originalIds.filter((id) => !currentIds.includes(id));
      if (toDelete.length) {
        const { error } = await supabase.from("atad2_appendix_skeleton").delete().in("id", toDelete);
        if (error) throw error;
      }
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        // Only the editable columns are touched; the wiring fields
        // (driven_by_question_ids, render_if) are preserved.
        const payload = {
          row_id: r.rowId.trim(),
          section_id: r.sectionId.trim(),
          section_title: r.sectionTitle.trim(),
          legal_basis: r.legalBasis.trim(),
          condition_tested: r.conditionTested.trim(),
          effect: r.effect || null,
          kind: r.kind || "gate",
          related_view: r.relatedView || "none",
          allowed_states: parseStates(r.allowedStates),
          sort_order: i,
          updated_at: new Date().toISOString(),
        };
        if (r.id) {
          const { error } = await supabase.from("atad2_appendix_skeleton").update(payload).eq("id", r.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("atad2_appendix_skeleton").insert({ ...payload, is_active: true });
          if (error) throw error;
        }
      }
      toast.success("Legal framework saved");
      await qc.invalidateQueries({ queryKey: ["admin-appendix-skeleton"] });
      await qc.invalidateQueries({ queryKey: ["appendix-skeleton"] });
    } catch (e) {
      toast.error("Save failed", { description: String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <Seo title="Admin · Appendix legal framework" description="Edit the ATAD2 technical-appendix rows" canonical="/admin/appendix-skeleton" />
      <div className="flex items-end justify-between mb-6">
        <div>
          <div className="text-[11px] font-normal uppercase tracking-[0.16em] text-ds-ink-secondary mb-1">Admin</div>
          <h1 className="text-2xl font-normal tracking-tight text-ds-ink">Appendix legal framework</h1>
          <p className="text-sm text-ds-ink-secondary mt-1">
            The fixed rows of the technical appendix (art. 2 + 12aa-12af). Edits here flow into every new and regenerated appendix; the question wiring stays in code.
          </p>
        </div>
        <Button onClick={save} disabled={saving || q.isLoading}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save changes
        </Button>
      </div>

      {q.isLoading ? (
        <p className="text-ds-ink-secondary">Loading the legal framework…</p>
      ) : (
        <div className="space-y-3">
          {rows.map((r, i) => (
            <Card key={r.id ?? `new-${i}`}>
              <CardContent className="space-y-3 py-4">
                <div className="flex items-center gap-2">
                  <Input
                    value={r.rowId}
                    onChange={(e) => update(i, { rowId: e.target.value })}
                    placeholder="row id"
                    className="w-28 font-mono text-xs"
                    disabled={!!r.id}
                    title={r.id ? "Row id is fixed for existing rows" : "Choose a unique id, e.g. 3.12"}
                  />
                  <span className="flex-1" />
                  <Button variant="ghost" size="icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up">
                    <ChevronUp className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => move(i, 1)} disabled={i === rows.length - 1} aria-label="Move down">
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => removeRow(i)} aria-label="Remove row">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Section id</Label>
                    <Input value={r.sectionId} onChange={(e) => update(i, { sectionId: e.target.value })} className="font-mono text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Section title</Label>
                    <Input value={r.sectionTitle} onChange={(e) => update(i, { sectionTitle: e.target.value })} className="text-sm" />
                  </div>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Legal basis (citation)</Label>
                  <Input value={r.legalBasis} onChange={(e) => update(i, { legalBasis: e.target.value })} className="text-sm" placeholder="Article 12aa(1)(b) Wet Vpb 1969" />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs">Condition tested</Label>
                  <Textarea value={r.conditionTested} onChange={(e) => update(i, { conditionTested: e.target.value })} rows={2} className="text-sm" />
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[120px_200px_1fr]">
                  <div className="space-y-1">
                    <Label className="text-xs">Effect</Label>
                    <Select value={r.effect || "none"} onValueChange={(v) => update(i, { effect: v === "none" ? "" : v })}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="D/NI">D/NI</SelectItem>
                        <SelectItem value="DD">DD</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Colour kind</Label>
                    <Select value={r.kind || "gate"} onValueChange={(v) => update(i, { kind: v })}>
                      <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="gate">Gate (neutral)</SelectItem>
                        <SelectItem value="operative">Operative (red/green)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Status options (comma-separated)</Label>
                    <Input value={r.allowedStates} onChange={(e) => update(i, { allowedStates: e.target.value })} className="text-sm" />
                  </div>
                </div>

                <div className="space-y-1 sm:max-w-xs">
                  <Label className="text-xs">Related-parties view (from the structure chart)</Label>
                  <Select value={r.relatedView || "none"} onValueChange={(v) => update(i, { relatedView: v })}>
                    <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="popover">Popover (compact list)</SelectItem>
                      <SelectItem value="inline">Inline (association panel)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          ))}

          <Button variant="outline" onClick={addRow} className="gap-2">
            <Plus className="h-4 w-4" />
            Add row
          </Button>
        </div>
      )}
    </div>
  );
}
