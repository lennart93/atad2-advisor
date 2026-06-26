import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button, StatusPill } from "@/components/ds";
import { useOpenQuestionsView } from "@/hooks/useOpenQuestions";
import { OpenQuestionsSheet } from "./OpenQuestionsSheet";
import { OpenQuestionsHint } from "./OpenQuestionsHint";

export interface OpenQuestionsButtonProps {
  sessionId: string | null;
  /** True only on the questionnaire (questions) step, where the open-questions
   *  coachmark is allowed to appear. */
  onQuestionsStep?: boolean;
}

/**
 * Sub-header button with the live open-questions count. Opens the register
 * sheet; "Go to question" closes the sheet and deep links into the questions
 * flow via ?q=<id>, which the guarded effect in Assessment.tsx consumes.
 * A `?worklist=sent` query param (set by the dossier card) opens the sheet
 * pre-filtered to the points that are out with the client; the param is
 * consumed immediately so closing the sheet does not reopen it.
 * Lives beside the stepper for now; moves to DossierShell in a later slice.
 *
 * The button hides itself once nothing is actively open (badge count 0): an
 * empty "Open questions" chip in the sub-header is noise. The full register,
 * including resolved history and off-path points, stays reachable from the
 * dedicated Open questions page. It stays mounted while the sheet is open or
 * a ?worklist=sent link is being consumed so neither closes out underneath.
 */
export function OpenQuestionsButton({
  sessionId,
  onQuestionsStep = false,
}: OpenQuestionsButtonProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sentOnly, setSentOnly] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  // Queries inside the view hook are disabled while sessionId is null, so
  // calling it before the guard below is safe and keeps hook order stable.
  const { badgeCount } = useOpenQuestionsView(sessionId);

  const wantsSentWorklist = searchParams.get("worklist") === "sent";
  useEffect(() => {
    if (!wantsSentWorklist || !sessionId) return;
    setSentOnly(true);
    setSheetOpen(true);
    const next = new URLSearchParams(searchParams);
    next.delete("worklist");
    setSearchParams(next, { replace: true });
  }, [wantsSentWorklist, sessionId, searchParams, setSearchParams]);

  if (!sessionId) return null;
  // No active open questions: drop the chip entirely. Keep it while the sheet
  // is open or a sent-worklist deep link is still being consumed.
  if (badgeCount === 0 && !sheetOpen && !wantsSentWorklist) return null;

  return (
    <>
      <Button
        ref={buttonRef}
        variant="secondary"
        size="sm"
        onClick={() => {
          setSentOnly(false);
          setSheetOpen(true);
        }}
      >
        Open questions
        {badgeCount > 0 && (
          <StatusPill status="neutral" className="ds-tabular-nums">
            {badgeCount}
          </StatusPill>
        )}
      </Button>
      <OpenQuestionsHint
        anchorRef={buttonRef}
        count={badgeCount}
        sessionId={sessionId}
        active={onQuestionsStep}
        panelOpen={sheetOpen}
        onActivate={() => {
          setSentOnly(false);
          setSheetOpen(true);
        }}
      />
      <OpenQuestionsSheet
        sessionId={sessionId}
        open={sheetOpen}
        onOpenChange={(open) => {
          setSheetOpen(open);
          if (!open) setSentOnly(false);
        }}
        sentOnly={sentOnly}
        onShowAll={() => setSentOnly(false)}
        onGoToQuestion={(questionId) => {
          setSheetOpen(false);
          navigate(`/assessment?session=${sessionId}&q=${questionId}`);
        }}
      />
    </>
  );
}
