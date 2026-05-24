import { unstable_usePrompt as usePrompt } from "react-router-dom";

const ASSESSMENT_PATH_RE = /^\/assessment(\/|-|$)/;

const MESSAGE =
  "Are you sure you want to leave this assessment? Your progress is saved — you can resume it from the dashboard.";

/**
 * Blocks in-app navigation away from any assessment route to a non-assessment
 * route. Lets the user navigate freely BETWEEN assessment routes
 * (Documents → Questions → Confirmation → Structure → Report).
 *
 * Uses React Router's unstable_usePrompt — a styled custom dialog would
 * require migrating to a data router. Browser-native confirm is good enough
 * for v1.
 */
export function useAssessmentLeaveGuard(enabled: boolean): void {
  usePrompt({
    when: ({ currentLocation, nextLocation }) => {
      if (!enabled) return false;
      // Block only when leaving the assessment area.
      const leaving =
        ASSESSMENT_PATH_RE.test(currentLocation.pathname) &&
        !ASSESSMENT_PATH_RE.test(nextLocation.pathname);
      return leaving;
    },
    message: MESSAGE,
  });
}
