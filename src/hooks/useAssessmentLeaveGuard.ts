import { useEffect } from "react";

const MESSAGE =
  "Are you sure you want to leave this assessment? Your progress is saved — you can resume it from the dashboard.";

/**
 * Warns the user before they close the tab, reload, or navigate to an external
 * URL while an assessment is active.
 *
 * In-app navigation between routes is NOT intercepted: react-router's
 * `unstable_usePrompt` / `useBlocker` require a data router
 * (`createBrowserRouter`), and this app still uses `<BrowserRouter>`.
 * Migrating to a data router is the proper fix for in-app leave prompts.
 * Progress is auto-saved per question, so missing the in-app warning is a
 * UX regression, not data loss.
 */
export function useAssessmentLeaveGuard(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore the custom string and show their own prompt,
      // but assigning returnValue is what actually triggers the dialog.
      e.returnValue = MESSAGE;
      return MESSAGE;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [enabled]);
}
