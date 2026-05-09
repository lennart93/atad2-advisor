// src/lib/structure/extraction.ts
import { supabase } from '@/integrations/supabase/client';
import type { ChartStatus } from './types';
import { refreshChartStatus } from './client';

const FUNCTIONS_BASE = import.meta.env.VITE_SUPABASE_URL + '/functions/v1';

export async function startExtraction(sessionId: string): Promise<{ chart_id: string }> {
  const { data: { session } } = await supabase.auth.getSession();
  const r = await fetch(`${FUNCTIONS_BASE}/extract-structure`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!r.ok) throw new Error(`Extraction failed: ${r.status} ${await r.text()}`);
  return r.json();
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS  = 240_000;

const TERMINAL: ReadonlyArray<ChartStatus> = ['draft_ready', 'extraction_failed'];

export async function pollUntilTerminal(
  chartId: string,
  onUpdate: (status: ChartStatus) => void,
  signal?: AbortSignal,
): Promise<ChartStatus> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  while (true) {
    if (signal?.aborted) throw new Error('Polling aborted');
    if (Date.now() > deadline) throw new Error('Extraction polling timed out');
    const data = await refreshChartStatus(chartId);
    if (data) {
      onUpdate(data.status as ChartStatus);
      if (TERMINAL.includes(data.status as ChartStatus)) return data.status as ChartStatus;
    }
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }
}
