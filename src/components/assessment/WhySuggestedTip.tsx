import { useId } from "react";
import { Info } from "lucide-react";

interface WhySuggestedTipProps {
  /** The AI's answer_rationale behind the suggested answer. */
  rationale: string;
  /** The entity the facts are about (the session taxpayer); named in the
   *  kicker and set in medium ink inside the body text. */
  entityName?: string | null;
}

// Escape a name so it can be used inside a RegExp (same guard as the
// difficult-term highlighting in QuestionText).
const escapeRegExp = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// The body sentence with every mention of the entity in medium full ink, so
// the subject pops out of the softer surrounding text.
const renderBody = (text: string, entityName?: string | null) => {
  const name = entityName?.trim();
  if (!name) return text;

  const nameRegex = new RegExp(escapeRegExp(name), "gi");
  const parts = text.split(nameRegex);
  const matches = text.match(nameRegex);
  if (!matches || parts.length === 1) return text;

  return parts.map((part, index) => (
    <span key={index}>
      {part}
      {index < matches.length && (
        <span className="font-medium text-ds-ink">{matches[index]}</span>
      )}
    </span>
  ));
};

/**
 * The "Why this is suggested" hover affordance under the answer options: a
 * dashed-underline label with an info glyph that reads as hoverable, opening
 * a tight, labelled tooltip (kicker "From the facts", body with the entity in
 * medium weight) instead of a loose plain box. Also opens on keyboard focus.
 */
export const WhySuggestedTip = ({ rationale, entityName }: WhySuggestedTipProps) => {
  const tipId = useId();
  const name = entityName?.trim() || null;

  return (
    <div className="group relative inline-block">
      <button
        type="button"
        aria-describedby={tipId}
        className="inline-flex cursor-default items-center gap-2 border-b border-dashed border-ds-ink-tertiary pb-[2px] text-[13px] font-normal text-ds-ink-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-ds-accent"
      >
        <Info aria-hidden className="h-3.5 w-3.5 text-ds-ink-tertiary" />
        Why this is suggested
      </button>

      <div
        id={tipId}
        role="tooltip"
        className="invisible absolute left-0 top-[calc(100%+12px)] z-20 w-[300px] rounded-[5px] border border-ds-hairline bg-ds-card px-[17px] pb-4 pt-[15px] opacity-0 shadow-[0_6px_22px_-8px_rgba(20,18,10,0.22),0_2px_6px_-2px_rgba(20,18,10,0.10)] transition-opacity duration-fast group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100"
      >
        {/* Caret pointing up at the trigger. */}
        <span
          aria-hidden
          className="absolute -top-[6px] left-[26px] h-[11px] w-[11px] rotate-45 border-l border-t border-ds-hairline bg-ds-card"
        />
        <p className="mb-2 text-[10px] font-medium uppercase tracking-[0.15em] text-ds-ink-tertiary">
          From the facts
          {name && (
            <>
              {" · "}
              <span className="text-ds-ink-secondary">{name}</span>
            </>
          )}
        </p>
        <p className="text-pretty text-[13.5px] font-normal leading-[1.5] text-ds-ink-secondary">
          {renderBody(rationale, name)}
        </p>
      </div>
    </div>
  );
};
