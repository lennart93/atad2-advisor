export type EntityKey =
  | "sessions"
  | "users"
  | "questions"
  | "contextQuestions"
  | "feedback"
  | "analytics"
  | "explorer"
  | "audit"
  | "settings";

// Effectively dead: IconChip renders monochrome and ignores per-entity hues.
// Kept so the EntityKey type and any incidental consumers resolve to a single
// neutral scheme instead of the old rainbow.
const NEUTRAL_ENTITY = {
  fg: "var(--ds-ink-secondary)",
  bg: "var(--ds-fill-muted)",
  ring: "var(--ds-hairline)",
} as const;

export const ENTITY_COLORS: Record<EntityKey, { fg: string; bg: string; ring: string }> = {
  sessions:         NEUTRAL_ENTITY,
  users:            NEUTRAL_ENTITY,
  questions:        NEUTRAL_ENTITY,
  contextQuestions: NEUTRAL_ENTITY,
  feedback:         NEUTRAL_ENTITY,
  analytics:        NEUTRAL_ENTITY,
  explorer:         NEUTRAL_ENTITY,
  audit:            NEUTRAL_ENTITY,
  settings:         NEUTRAL_ENTITY,
};

export type RiskLevel = "low" | "medium" | "high";

export function getRiskLevel(points: number): RiskLevel {
  if (points <= 0) return "low";
  if (points < 1.0) return "medium";
  return "high";
}

// Real risk severity scale: high = amber (the one risk colour), medium = a
// lighter amber wash, low = neutral grey.
export const RISK_CHIP_CLASSES: Record<RiskLevel, { bg: string; text: string }> = {
  low:    { bg: "bg-ds-fill-muted", text: "text-ds-ink-secondary" },
  medium: { bg: "bg-ds-fill-muted", text: "text-ds-amber-text" },
  high:   { bg: "bg-ds-amber-bg", text: "text-ds-amber-text" },
};
