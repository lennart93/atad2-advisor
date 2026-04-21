import { format } from "date-fns";

/**
 * Canonical date format across the app: "12 Mar 2026".
 * Accepts ISO strings, Date objects, or null/undefined (returns "—").
 */
export function formatDate(input: string | Date | null | undefined): string {
  if (!input) return "—";
  const date = typeof input === "string" ? new Date(input) : input;
  if (Number.isNaN(date.getTime())) return "—";
  return format(date, "d MMM yyyy");
}
