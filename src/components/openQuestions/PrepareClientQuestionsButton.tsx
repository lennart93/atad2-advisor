import { useState } from "react";
import { Loader2, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  CLIENT_QUESTION_PROMPT_VERSION,
  needsClientQuestion,
  useActivePromptVersion,
  usePrepareClientQuestions,
} from "@/hooks/usePrepareClientQuestions";
import type { OpenQuestionRow } from "@/lib/openQuestions/types";

/**
 * Panel-header action for existing dossiers whose open rows still lack
 * client wording. Renders nothing once every open row has a client_question
 * (also right after a successful run, when the refreshed rows stream in).
 * Stays disabled with an honest hint until the v12 swarm prompt is live;
 * the run itself costs tokens, so an AlertDialog confirms first.
 */
export function PrepareClientQuestionsButton({
  sessionId,
  rows,
}: {
  sessionId: string;
  rows: OpenQuestionRow[];
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const prepare = usePrepareClientQuestions(sessionId);
  const activeVersion = useActivePromptVersion();
  const versionLive = (activeVersion ?? 0) >= CLIENT_QUESTION_PROMPT_VERSION;

  const targetCount = rows.filter(needsClientQuestion).length;
  if (targetCount === 0) return null;

  const plural = targetCount === 1 ? "" : "s";

  return (
    <div className="space-y-1">
      <Button
        variant="outline"
        size="sm"
        disabled={!versionLive || prepare.isPending}
        onClick={() => setConfirmOpen(true)}
      >
        {prepare.isPending ? (
          <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
        ) : (
          <MessageSquareText className="mr-1.5 h-3.5 w-3.5" />
        )}
        {prepare.isPending ? "Preparing..." : "Prepare client questions"}
      </Button>
      {!versionLive && (
        <p className="text-xs text-muted-foreground">
          The updated AI prompt is not live yet. This becomes available after
          the next platform update.
        </p>
      )}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Prepare client questions</AlertDialogTitle>
            <AlertDialogDescription>
              This re-runs the AI analysis for {targetCount} open question
              {plural} to write ready-to-send client questions. It uses AI
              tokens and also refreshes the AI suggestions for these questions.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => prepare.mutate()}>
              Prepare questions
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
