import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { toast } from "@/components/ui/sonner";
import type { OpenQuestionRow } from "@/lib/openQuestions/types";

/**
 * Mutations on the open-questions register plus the audit-event helper.
 *
 * Truth model: for an ON-PATH question the answer row in atad2_answers is
 * the truth and the register follows via a DB trigger, so keep-as-unknown
 * writes the answer row there. Only OFF-PATH rows (no answer row exists)
 * are updated in the register directly.
 *
 * Every mutation invalidates the open-questions rows and the session answer
 * map; the realtime channel in useOpenQuestions does the same for other tabs.
 */
export function useOpenQuestionActions(sessionId: string | null) {
  const qc = useQueryClient();

  /**
   * Append an event to the audit trail via the SECURITY DEFINER RPC.
   * Failures are swallowed with a console.warn: the audit log must never
   * block or fail a user action.
   */
  const logEvent = useCallback(
    async (questionId: string, event: string, detail?: Json) => {
      if (!sessionId) return;
      try {
        const { error } = await supabase.rpc("log_open_question_event", {
          p_session_id: sessionId,
          p_question_id: questionId,
          p_event: event,
          p_detail: detail ?? null,
        });
        if (error) throw error;
      } catch (e) {
        console.warn("Open question event log failed:", e);
      }
    },
    [sessionId],
  );

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["open-questions", sessionId] });
    qc.invalidateQueries({ queryKey: ["session-answer-map", sessionId] });
  }, [qc, sessionId]);

  const keepAsUnknown = useMutation({
    mutationFn: async ({
      row,
      reason,
      onPath,
    }: {
      row: OpenQuestionRow;
      reason: string;
      onPath: boolean;
    }) => {
      if (!sessionId) throw new Error("No session id");
      if (onPath) {
        // ANSWERS is the truth; the DB trigger flips the register row to
        // confirmed_unknown when these columns change.
        const { data: authData } = await supabase.auth.getUser();
        const userId = authData.user?.id;
        if (!userId) throw new Error("Not authenticated");
        const { error } = await supabase
          .from("atad2_answers")
          .update({
            unknown_confirmed_at: new Date().toISOString(),
            unknown_confirmed_by: userId,
            unknown_confirmed_note: reason,
          })
          .eq("session_id", sessionId)
          .eq("question_id", row.question_id);
        if (error) throw error;
      } else {
        // Off-path: no answer row exists, update the register directly.
        const { error } = await supabase
          .from("atad2_open_questions")
          .update({
            status: "confirmed_unknown",
            resolution_note: reason,
            resolved_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        if (error) throw error;
      }
      await logEvent(row.question_id, "confirmed_unknown", {
        note: reason,
        on_path: onPath,
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success("Kept as unknown", {
        description: "The reason is recorded in the audit trail.",
      });
    },
    onError: (e: Error) => {
      toast.error("Could not keep as unknown", { description: e.message });
    },
  });

  const dismiss = useMutation({
    mutationFn: async ({ row }: { row: OpenQuestionRow }) => {
      // Off-path rows only; the visibility rules hide this action elsewhere.
      const { error } = await supabase
        .from("atad2_open_questions")
        .update({
          status: "dismissed",
          resolved_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) throw error;
      await logEvent(row.question_id, "dismissed");
    },
    onSuccess: () => {
      invalidate();
      toast.success("Marked as not relevant");
    },
    onError: (e: Error) => {
      toast.error("Could not update the question", { description: e.message });
    },
  });

  const markSentToClient = useMutation({
    mutationFn: async ({ row }: { row: OpenQuestionRow }) => {
      const { error } = await supabase
        .from("atad2_open_questions")
        .update({
          status: "taken_to_client",
          taken_to_client_at: new Date().toISOString(),
        })
        .eq("id", row.id);
      if (error) throw error;
      await logEvent(row.question_id, "marked_sent_to_client");
    },
    onSuccess: () => {
      invalidate();
      toast.success("Marked as sent to client");
    },
    onError: (e: Error) => {
      toast.error("Could not update the question", { description: e.message });
    },
  });

  const saveClientAnswer = useMutation({
    mutationFn: async ({ row, answer }: { row: OpenQuestionRow; answer: string }) => {
      const trimmed = answer.trim();
      if (!trimmed) throw new Error("The client answer is empty");
      const { error } = await supabase
        .from("atad2_open_questions")
        .update({
          client_answer: trimmed,
          client_answer_at: new Date().toISOString(),
          status: "answered",
        })
        .eq("id", row.id);
      if (error) throw error;
      await logEvent(row.question_id, "client_answer_saved", {
        chars: trimmed.length,
      });
    },
    onSuccess: () => {
      invalidate();
      toast.success(
        "Saved. The answer stays unconfirmed until you apply it in the questions flow.",
      );
    },
    onError: (e: Error) => {
      toast.error("Could not save the client answer", { description: e.message });
    },
  });

  return { logEvent, keepAsUnknown, dismiss, markSentToClient, saveClientAnswer };
}
