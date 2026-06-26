import { useEffect, useId, useRef, useState } from "react";
import { CheckCircle2, ChevronRight, Loader2 } from "lucide-react";
import { Button, StatusPill } from "@/components/ds";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { OpenPoint } from "@/lib/openQuestions/worklist";
import { formatDate } from "@/utils/formatDate";

export interface OpenPointRowProps {
  point: OpenPoint;
  expanded: boolean;
  onToggle: () => void;
  /** Whether this point is included in the "Copy points for client" list. */
  selected: boolean;
  onSelectChange: (checked: boolean) => void;
  /** True while THIS point's answer is being worked out by the AI. The row's
   * own state disables its own field, so saving one point never disables
   * another's textarea mid-typing. */
  saving?: boolean;
  onSaveContext: (context: string) => Promise<void>;
}

/** A point counts as answered only once the advisor's input is saved. */
function isAnswered(point: OpenPoint): boolean {
  return point.status === "answered" || point.status === "answered_by_client";
}

/** The free-text context the advisor saved, shown on a resolved card. */
function savedContext(point: OpenPoint): string {
  if (point.answerDetail) return point.answerDetail;
  // Legacy rows may carry a yes/no; show it so nothing is hidden.
  if (point.answerValue) return point.answerValue === "yes" ? "Yes" : "No";
  return "";
}

/**
 * One point as a card (the appendix accordion pattern). The advisor supplies
 * facts in free text; the AI does the legal classification. There is no Yes/No
 * here. The checkbox controls whether the point goes into the "Copy points for
 * client" list; it never changes the point's open/answered status. Collapsed,
 * an answered card shows its badge + saved input; expanded, an open card shows
 * the free-text field and Save answer. The decision-tree mapping is never
 * surfaced.
 */
export function OpenPointRow({
  point,
  expanded,
  onToggle,
  selected,
  onSelectChange,
  saving = false,
  onSaveContext,
}: OpenPointRowProps) {
  const answered = isAnswered(point);
  // Show the "Answered" pill only once the AI has actually written the answer.
  // While this point is still being worked out, a realtime refetch may have
  // flipped the row to 'answered' before the answer exists, so hold the pill
  // back. An open row carries no badge; its expanded input field already
  // signals that it needs input.
  const showAnswered = answered && !saving;

  return (
    <div
      className={cn(
        "rounded-ds-card border border-ds-hairline bg-ds-card",
        expanded && !answered && "border-l-2 border-l-ds-ink-tertiary",
      )}
    >
      {/* The checkbox sits beside the toggle, never inside it, so selecting a
          point for the client list does not expand or collapse the card. */}
      <div className="flex items-center gap-3 px-4 py-3">
        <Checkbox
          checked={selected}
          onCheckedChange={(value) => onSelectChange(value === true)}
          aria-label="Include this point when asking the client"
          className="shrink-0"
        />
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={expanded}
        >
          <span
            className={cn(
              "min-w-0 flex-1 text-[13px] font-medium leading-snug text-ds-ink",
              !expanded && "truncate",
            )}
          >
            {point.number !== null && (
              <span className="ds-tabular-nums text-ds-ink-secondary">
                {point.number}.{" "}
              </span>
            )}
            {point.questionText}
          </span>
          {showAnswered && (
            <StatusPill status="complete" className="shrink-0">
              <CheckCircle2 aria-hidden="true" />
              Answered
            </StatusPill>
          )}
          <ChevronRight
            className={cn(
              "h-4 w-4 shrink-0 text-ds-ink-secondary transition-transform",
              expanded && "rotate-90",
            )}
          />
        </button>
      </div>

      {expanded && (
        <div className="space-y-3 border-t border-ds-hairline px-4 py-4">
          {saving ? (
            <p className="flex items-center gap-2 py-1 text-[13px] text-ds-ink-secondary">
              <Loader2 className="h-4 w-4 motion-safe:animate-spin text-ds-ink-secondary" />
              Working out the answer from what you provided...
            </p>
          ) : (
            <>
              {point.needsAttention && point.reopenReason && (
                <p className="text-[13px] text-ds-ink-secondary">{point.reopenReason}</p>
              )}

              <PointResolution
                point={point}
                saved={savedContext(point)}
                onSaveContext={onSaveContext}
              />
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Status-specific body: the free-text form or the recorded outcome. */
function PointResolution({
  point,
  saved,
  onSaveContext,
}: {
  point: OpenPoint;
  saved: string;
  onSaveContext: (context: string) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);

  if (!isAnswered(point) || editing) {
    return (
      <ContextForm
        point={point}
        onSave={async (context) => {
          await onSaveContext(context);
          setEditing(false);
        }}
        onCancel={editing ? () => setEditing(false) : undefined}
      />
    );
  }

  // answered / answered_by_client
  return (
    <div className="space-y-3">
      <div className="rounded-ds-control bg-ds-fill-muted px-3 py-2">
        <p className="text-[13px] font-medium text-ds-ink-secondary ds-tabular-nums">
          {point.status === "answered_by_client"
            ? `Client reply, recorded ${formatDate(point.answeredAt)}`
            : `Your input, saved ${formatDate(point.answeredAt)}`}
        </p>
        <p className="mt-1 whitespace-pre-wrap text-[13px] text-ds-ink">{saved}</p>
      </div>
      <ReadBack />
      <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
        Edit answer
      </Button>
    </div>
  );
}

/**
 * The read-back, the confirmation step that replaces the manual Yes/No. Saving
 * runs the AI over the facts and writes the Yes/No + explanation onto the
 * questionnaire, so this points the advisor there to confirm it.
 */
function ReadBack() {
  return (
    <p
      role="status"
      aria-live="polite"
      className="rounded-ds-control border border-ds-hairline bg-ds-fill-muted px-3 py-2 text-[13px] text-ds-ink"
    >
      Saved as a draft answer in the questionnaire. Review and confirm it
      there.
    </p>
  );
}

/**
 * The free-text context input plus Save answer. The advisor types what they
 * know (facts, not conclusions) and the AI turns it into the questionnaire
 * answer. Because Continue is always available, a typed-but-unsaved note is
 * protected three ways: it auto-saves when the field loses focus (including
 * when Continue is clicked), Cmd/Ctrl+Enter saves the focused field, and the
 * browser warns before a tab close while the note is unsaved.
 */
function ContextForm({
  point,
  onSave,
  onCancel,
}: {
  point: OpenPoint;
  onSave: (context: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [context, setContext] = useState(point.answerDetail ?? "");
  const [saving, setSaving] = useState(false);
  // The last value committed to the server. Auto-save only fires for changes
  // against this baseline, which also stops a blur and an explicit Save from
  // both firing for the same text.
  const savedBaselineRef = useRef(point.answerDetail ?? "");

  const fieldId = useId();
  const canSave = context.trim().length > 0;
  const dirty = canSave && context !== savedBaselineRef.current;
  // Gate only on THIS field's own save, never a global flag: a save in one
  // card must not disable another card's textarea while the advisor is typing.
  const disabled = saving;

  const save = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    // Record the baseline before the await so a blur racing the same click
    // sees the text as already committed and does not save it twice.
    savedBaselineRef.current = context;
    try {
      await onSave(context);
    } finally {
      setSaving(false);
    }
  };

  const handleBlur = () => {
    if (dirty) void save();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      void save();
    }
  };

  // Backstop for a tab close or refresh while a note is dirty: blur-save
  // already covers in-app navigation, this covers leaving the browser.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor={fieldId} className="block text-[13px] font-medium text-ds-ink">
          What you know about this
        </label>
        <Textarea
          id={fieldId}
          value={context}
          onChange={(event) => setContext(event.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          rows={3}
          disabled={disabled}
          placeholder="A short factual note"
          className="bg-ds-card text-[13px]"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* preventDefault on mousedown keeps focus in the field, so clicking
            Save (or Cancel) never blurs it and never double-fires auto-save. */}
        <Button
          variant="secondary"
          size="sm"
          disabled={disabled || !canSave}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void save()}
        >
          {saving && <Loader2 className="motion-safe:animate-spin" />}
          {saving ? "Working it out..." : "Save answer"}
        </Button>
        {onCancel && (
          <Button
            variant="ghost"
            size="sm"
            disabled={disabled}
            onMouseDown={(event) => event.preventDefault()}
            onClick={onCancel}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
