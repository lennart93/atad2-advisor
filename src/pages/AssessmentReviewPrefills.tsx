import { useParams, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAllPrefills, useUpdatePrefillAction } from "@/hooks/usePrefill";
import { SuggestionCard } from "@/components/prefill/SuggestionCard";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function AssessmentReviewPrefills() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();

  const { data: prefills } = useAllPrefills(sessionId ?? null);
  const updateAction = useUpdatePrefillAction();

  const { data: answers } = useQuery({
    enabled: !!sessionId,
    queryKey: ["answers", sessionId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_answers")
        .select("question_id, answer, explanation")
        .eq("session_id", sessionId!);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: questions } = useQuery({
    queryKey: ["questions-distinct"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("atad2_questions")
        .select("question_id, question, question_title");
      if (error) throw error;
      const uniq = new Map<string, { question_id: string; question: string; question_title: string | null }>();
      for (const q of data ?? []) if (!uniq.has(q.question_id)) uniq.set(q.question_id, q);
      return Array.from(uniq.values());
    },
  });

  useEffect(() => {
    if (!sessionId) return;
    if (prefills !== undefined && prefills.length === 0) {
      navigate(`/assessment-confirmation/${sessionId}`, { replace: true });
    }
  }, [prefills, sessionId, navigate]);

  if (!sessionId) return <div className="p-8">Missing session.</div>;
  if (!prefills) return <div className="p-8">Loading…</div>;

  const pendingCount = prefills.filter((p) => p.user_action === "pending").length;

  const updateAnswerExplanation = async (questionId: string, explanation: string) => {
    await supabase
      .from("atad2_answers")
      .update({ explanation })
      .eq("session_id", sessionId)
      .eq("question_id", questionId);
  };

  const moveToAdditionalContext = async (text: string) => {
    const { data: session } = await supabase
      .from("atad2_sessions")
      .select("additional_context")
      .eq("session_id", sessionId)
      .maybeSingle();
    const combined = session?.additional_context?.trim()
      ? `${session.additional_context}\n\n${text}`
      : text;
    await supabase.from("atad2_sessions").update({ additional_context: combined }).eq("session_id", sessionId);
  };

  const acceptAll = async () => {
    for (const p of prefills) {
      if (p.user_action !== "pending") continue;
      const existing = answers?.find((a) => a.question_id === p.question_id);
      const next = (existing?.explanation ?? "").trim().length === 0
        ? p.suggested_toelichting
        : `${existing?.explanation}\n\n${p.suggested_toelichting}`;
      await updateAnswerExplanation(p.question_id, next);
      updateAction.mutate({ prefillId: p.id, action: "accepted" });
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-5">
      <header>
        <h1 className="text-2xl font-semibold">Review extracted context before generating the report</h1>
        <p className="text-sm text-muted-foreground mt-1">{pendingCount} pending</p>
      </header>

      <div className="flex gap-2">
        <Button onClick={acceptAll} disabled={pendingCount === 0}>Accept all suggestions</Button>
        <Button variant="outline" onClick={() => navigate(`/assessment-confirmation/${sessionId}`)}>
          Continue
        </Button>
      </div>

      <div className="space-y-4">
        {prefills
          // Only show suggestions for questions the user actually traversed.
          // Untraversed questions are out of scope for this assessment path.
          .filter((p) => answers?.some((a) => a.question_id === p.question_id))
          .map((p) => {
            const q = questions?.find((qq) => qq.question_id === p.question_id);
            const ans = answers?.find((a) => a.question_id === p.question_id);
            return (
            <Card key={p.id}>
              <CardContent className="space-y-3 pt-4">
                <div className="text-sm">
                  <span className="font-medium">Q{p.question_id}.</span>{" "}
                  {q?.question_title ?? q?.question}
                </div>
                <div className="text-xs text-muted-foreground">
                  Your answer: {ans?.answer ?? "—"}
                </div>
                {ans?.explanation && (
                  <div className="text-xs border rounded p-2 bg-muted/40 whitespace-pre-wrap">{ans.explanation}</div>
                )}
                <SuggestionCard
                  prefill={p}
                  currentToelichting={ans?.explanation ?? ""}
                  onCommit={(next) => { void updateAnswerExplanation(p.question_id, next); }}
                  onDismissToAdditionalContext={moveToAdditionalContext}
                />
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
