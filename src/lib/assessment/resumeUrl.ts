import { supabase } from "@/integrations/supabase/client";

export interface SessionLike {
  session_id: string;
  completed: boolean | null;
  outcome_confirmed: boolean | null;
}

/**
 * Derives the right "resume" URL for a session from its current data, without
 * relying on a stored "last step" column. The decision tree mirrors the
 * assessment flow: Documents → Questions → Confirmation → Structure → Report.
 */
export async function resumeUrlForSession(session: SessionLike): Promise<string> {
  const { session_id, completed, outcome_confirmed } = session;

  // Past the Questions step.
  if (completed) {
    if (!outcome_confirmed) {
      return `/assessment-confirmation/${session_id}`;
    }
    // Outcome confirmed — they're somewhere in Structure or Report. The chart
    // status tells us which: finalized → Report, otherwise still on Structure.
    const { data: chart } = await supabase
      .from("atad2_structure_charts")
      .select("status")
      .eq("session_id", session_id)
      .maybeSingle();
    if (chart?.status === "finalized") {
      return `/assessment-report/${session_id}`;
    }
    return `/assessment/structure/${session_id}`;
  }

  // Not completed — either still in Questions, or hasn't started them yet.
  const { count: answerCount } = await supabase
    .from("atad2_answers")
    .select("id", { count: "exact", head: true })
    .eq("session_id", session_id);
  if ((answerCount ?? 0) > 0) {
    return `/assessment?session=${session_id}`;
  }

  // No answers yet — bring them back to Documents so they can either upload
  // more or click Continue. If they have no docs either, this is also the
  // right landing spot (the page handles the empty state).
  return `/assessment/upload?session=${session_id}`;
}
