import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, Search, Sparkles } from "lucide-react";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdminCard } from "@/components/admin/AdminCard";
import { toast } from "@/hooks/use-toast";
import { PrefillPromptEditor } from "@/components/admin/prefill/PrefillPromptEditor";
import { DiffView } from "@/components/admin/prompt-tuner/DiffView";
import { AnalysisPanel } from "@/components/admin/prompt-tuner/AnalysisPanel";
import { OriginalCandidatePicker } from "@/components/admin/prompt-tuner/OriginalCandidatePicker";
import { AppendixEditPicker } from "@/components/admin/prompt-tuner/AppendixEditPicker";
import { PROMPT_DESCRIPTORS, type PromptKey } from "@/lib/admin/promptKeys";
import {
  analyzeImprovement, findAppendixEdits, findMemoOriginals,
  OUTPUT_TYPE_TO_KEY,
  type AppendixCandidate, type MemoCandidate, type TuningAnalysis, type TunerOutputType,
} from "@/lib/admin/promptTuner";

interface ConfirmedPair { original: string; improved: string; }

export default function PromptTuner() {
  const [tab, setTab] = useState<TunerOutputType>("memo");

  // Memo input
  const [improvedText, setImprovedText] = useState("");
  const [manualMode, setManualMode] = useState(false);
  const [manualOriginal, setManualOriginal] = useState("");

  // Find results + selection
  const [memoCandidates, setMemoCandidates] = useState<MemoCandidate[] | null>(null);
  const [appendixCandidates, setAppendixCandidates] = useState<AppendixCandidate[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Confirmed pair + result
  const [confirmed, setConfirmed] = useState<ConfirmedPair | null>(null);
  const [analysis, setAnalysis] = useState<TuningAnalysis | null>(null);

  // Draft editor seed
  const [draft, setDraft] = useState<{ key: PromptKey; systemPrompt: string; notes: string } | null>(null);

  const targetKey = OUTPUT_TYPE_TO_KEY[tab];

  const resetFlow = () => {
    setMemoCandidates(null);
    setAppendixCandidates(null);
    setSelectedId(null);
    setConfirmed(null);
    setAnalysis(null);
    setManualMode(false);
    setManualOriginal("");
  };

  const changeTab = (next: TunerOutputType) => {
    if (next === tab) return;
    setTab(next);
    setImprovedText("");
    resetFlow();
  };

  const findMemo = useMutation({
    mutationFn: () => findMemoOriginals(improvedText),
    onSuccess: (rows) => {
      setMemoCandidates(rows);
      setSelectedId(rows[0]?.source_row_id ?? null);
    },
    onError: (e) => toast({ title: "Search failed", description: String(e instanceof Error ? e.message : e), variant: "destructive" }),
  });

  const loadAppendix = useMutation({
    mutationFn: () => findAppendixEdits(),
    onSuccess: (rows) => {
      setAppendixCandidates(rows);
      setSelectedId(rows[0]?.edit_id ?? null);
    },
    onError: (e) => toast({ title: "Load failed", description: String(e instanceof Error ? e.message : e), variant: "destructive" }),
  });

  const analyze = useMutation({
    mutationFn: (pair: ConfirmedPair) =>
      analyzeImprovement({ outputType: tab, originalText: pair.original, improvedText: pair.improved }),
    onSuccess: (a) => setAnalysis(a),
    onError: (e) => toast({ title: "Analysis failed", description: String(e instanceof Error ? e.message : e), variant: "destructive" }),
  });

  const confirmMemoSelection = () => {
    const c = memoCandidates?.find((x) => x.source_row_id === selectedId);
    if (!c) return;
    setConfirmed({ original: c.original_text, improved: improvedText });
  };

  const confirmManual = () => {
    if (!manualOriginal.trim()) return;
    setConfirmed({ original: manualOriginal, improved: improvedText });
  };

  const confirmAppendixSelection = () => {
    const c = appendixCandidates?.find((x) => x.edit_id === selectedId);
    if (!c) return;
    setConfirmed({ original: c.original_text, improved: c.improved_text });
  };

  const openDraft = () => {
    if (!analysis) return;
    setDraft({
      key: targetKey,
      systemPrompt: analysis.proposed_revised_system_prompt,
      notes: analysis.suggested_notes
        ? `${analysis.suggested_notes} (via Prompt Tuner)`
        : "Sharpened from an improved output (via Prompt Tuner)",
    });
  };

  const placeholdersHint = PROMPT_DESCRIPTORS.find((d) => d.key === targetKey)?.placeholders;

  return (
    <main>
      <Seo title="Admin Prompt Tuner" description="Turn an improved output into a sharper prompt" canonical="/admin/prompt-tuner" />
      <div className="mb-6">
        <div className="text-xs uppercase tracking-[0.18em] text-muted-foreground mb-1">Admin</div>
        <h1 className="text-2xl font-medium tracking-tight">Prompt Tuner</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Paste an improved output. It finds the original, shows what changed and why, and proposes a sharper
          prompt you can save as a draft version.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => changeTab(v as TunerOutputType)} className="mb-5">
        <TabsList>
          <TabsTrigger value="memo">Memo</TabsTrigger>
          <TabsTrigger value="appendix">Technical appendix</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-5">
        {/* Step 1 - get an original/improved pair */}
        {!confirmed && tab === "memo" && (
          <>
            <AdminCard>
              <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium block mb-2">
                Improved memo
              </label>
              <Textarea
                rows={12}
                className="font-mono text-xs"
                placeholder="Paste your hand-improved version of the memo here..."
                value={improvedText}
                onChange={(e) => setImprovedText(e.target.value)}
              />
              <div className="flex justify-end mt-3">
                <Button
                  disabled={!improvedText.trim() || findMemo.isPending}
                  onClick={() => { resetFlow(); findMemo.mutate(); }}
                >
                  {findMemo.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                  <span className="ml-1.5">Find original</span>
                </Button>
              </div>
            </AdminCard>

            {manualMode ? (
              <AdminCard>
                <label className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium block mb-2">
                  Paste the original (AI) memo
                </label>
                <Textarea
                  rows={10}
                  className="font-mono text-xs"
                  placeholder="Paste the original AI memo here..."
                  value={manualOriginal}
                  onChange={(e) => setManualOriginal(e.target.value)}
                />
                <div className="flex justify-between mt-3">
                  <Button variant="ghost" size="sm" onClick={() => setManualMode(false)}>Back to search</Button>
                  <Button disabled={!manualOriginal.trim()} onClick={confirmManual}>Use this original</Button>
                </div>
              </AdminCard>
            ) : memoCandidates ? (
              <OriginalCandidatePicker
                candidates={memoCandidates}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onConfirm={confirmMemoSelection}
                onManual={() => setManualMode(true)}
              />
            ) : null}
          </>
        )}

        {!confirmed && tab === "appendix" && (
          <>
            <AdminCard>
              <p className="text-sm text-muted-foreground">
                Appendix corrections are already stored per row. Load recent manual edits and pick one to learn from,
                no pasting needed.
              </p>
              <div className="flex justify-end mt-3">
                <Button disabled={loadAppendix.isPending} onClick={() => loadAppendix.mutate()}>
                  {loadAppendix.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                  <span className="ml-1.5">Load recent corrections</span>
                </Button>
              </div>
            </AdminCard>

            {appendixCandidates && (
              <AppendixEditPicker
                candidates={appendixCandidates}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onConfirm={confirmAppendixSelection}
              />
            )}
          </>
        )}

        {/* Step 2 - confirmed pair: diff + analyze */}
        {confirmed && (
          <>
            <AdminCard>
              <div className="flex items-center justify-between gap-3 mb-3">
                <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-medium">
                  Original vs improved
                </div>
                <Button variant="ghost" size="sm" onClick={resetFlow}>Start over</Button>
              </div>
              <DiffView original={confirmed.original} improved={confirmed.improved} />
              {!analysis && (
                <div className="flex items-center justify-end gap-3 mt-3">
                  {analyze.isPending && (
                    <span className="text-xs text-muted-foreground">This can take 30 to 90 seconds...</span>
                  )}
                  <Button disabled={analyze.isPending} onClick={() => analyze.mutate(confirmed)}>
                    {analyze.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                    <span className="ml-1.5">Analyze and suggest prompt</span>
                  </Button>
                </div>
              )}
            </AdminCard>

            {analysis && (
              <AnalysisPanel analysis={analysis} targetKey={targetKey} onCreateDraft={openDraft} />
            )}
          </>
        )}
      </div>

      {draft && (
        <PrefillPromptEditor
          promptKey={draft.key}
          placeholdersHint={placeholdersHint}
          initialSystemPrompt={draft.systemPrompt}
          initialNotes={draft.notes}
          onClose={() => setDraft(null)}
        />
      )}
    </main>
  );
}
