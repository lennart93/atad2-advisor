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

export const ENTITY_COLORS: Record<EntityKey, { fg: string; bg: string; ring: string }> = {
  sessions:         { fg: "#4f46e5", bg: "#eef2ff", ring: "#c7d2fe" },
  users:            { fg: "#d97706", bg: "#fef3c7", ring: "#fcd34d" },
  questions:        { fg: "#16a34a", bg: "#dcfce7", ring: "#86efac" },
  contextQuestions: { fg: "#0891b2", bg: "#cffafe", ring: "#67e8f9" },
  feedback:         { fg: "#db2777", bg: "#fce7f3", ring: "#f9a8d4" },
  analytics:        { fg: "#6366f1", bg: "#e0e7ff", ring: "#c7d2fe" },
  explorer:         { fg: "#2563eb", bg: "#dbeafe", ring: "#93c5fd" },
  audit:            { fg: "#dc2626", bg: "#fee2e2", ring: "#fca5a5" },
  settings:         { fg: "#9333ea", bg: "#f3e8ff", ring: "#d8b4fe" },
};

export type RiskLevel = "low" | "medium" | "high";

export function getRiskLevel(points: number): RiskLevel {
  if (points <= 0) return "low";
  if (points < 1.0) return "medium";
  return "high";
}

export const RISK_CHIP_CLASSES: Record<RiskLevel, { bg: string; text: string }> = {
  low:    { bg: "bg-[#dcfce7]", text: "text-[#166534]" },
  medium: { bg: "bg-[#fef3c7]", text: "text-[#92400e]" },
  high:   { bg: "bg-[#fee2e2]", text: "text-[#991b1b]" },
};
