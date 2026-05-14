// src/lib/assessment/useAssessmentSessionId.ts
import { useParams, useSearchParams } from 'react-router-dom';

/** Pure resolver — path param wins, then the `?session=` query param. */
export function resolveSessionId(
  pathParam: string | undefined,
  search: URLSearchParams,
): string | null {
  if (pathParam) return pathParam;
  const q = search.get('session');
  return q && q.length > 0 ? q : null;
}

/**
 * The one place the assessment flow resolves its session id. Handles both
 * routing conventions: `/assessment/structure/:sessionId` (path param) and
 * `/assessment?session=...` / `/assessment/upload?session=...` (query param).
 */
export function useAssessmentSessionId(): string | null {
  const params = useParams();
  const [search] = useSearchParams();
  return resolveSessionId(params.sessionId, search);
}
