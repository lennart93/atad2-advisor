// src/lib/structure/extraction.ts
import { supabase } from '@/integrations/supabase/client';
import type { ChartStatus } from './types';
import { refreshChartStatus } from './client';

const FUNCTIONS_BASE = import.meta.env.VITE_SUPABASE_URL + '/functions/v1';

export async function startExtraction(
  sessionId: string,
  phase: 'docs_only' | 'refine' = 'refine',
): Promise<{ chart_id: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`${FUNCTIONS_BASE}/extract-structure`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ session_id: sessionId, phase }),
  });
  if (!r.ok) {
    const err = new Error(`Extraction failed: ${r.status} ${await r.text()}`) as Error & { status: number };
    err.status = r.status;
    throw err;
  }
  return r.json();
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 360_000;
const MAX_CONSECUTIVE_FETCH_ERRORS = 5;

const TERMINAL: ReadonlyArray<ChartStatus> = ['draft_ready', 'extraction_failed', 'phase_a_ready'];

export async function pollUntilTerminal(
  chartId: string,
  onUpdate: (status: ChartStatus) => void,
  signal?: AbortSignal,
): Promise<ChartStatus> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let consecutiveErrors = 0;
  while (true) {
    if (signal?.aborted) throw new Error('Polling aborted');
    if (Date.now() > deadline) throw new Error('Extraction polling timed out');
    try {
      const data = await refreshChartStatus(chartId);
      consecutiveErrors = 0;
      if (data) {
        onUpdate(data.status as ChartStatus);
        if (TERMINAL.includes(data.status as ChartStatus)) return data.status as ChartStatus;
      }
    } catch (err) {
      consecutiveErrors += 1;
      console.warn(
        `[pollUntilTerminal] refresh failed (${consecutiveErrors}/${MAX_CONSECUTIVE_FETCH_ERRORS})`,
        err,
      );
      if (consecutiveErrors >= MAX_CONSECUTIVE_FETCH_ERRORS) {
        throw new Error(
          `Polling failed: ${MAX_CONSECUTIVE_FETCH_ERRORS} consecutive refresh errors`,
        );
      }
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}
