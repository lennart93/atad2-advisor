import type { ActingTogetherCluster } from '@/lib/appendix/types';
import type { ActingLikelihood } from './actingLikelihood';

/**
 * The likelihood levels that put a grouping in the client annex by default.
 * Shareholders are associated enterprises from 25%, so a grouping only reaches
 * the client when the advisor assessed it as likely (or higher) to act together.
 */
export function actingLikelyByDefault(l: ActingLikelihood): boolean {
  return l === 'likely' || l === 'highly_likely';
}

/**
 * Whether a cluster is shown in the client annex. The advisor's explicit
 * decision (includeInClient) always wins; without one, the likelihood sets the
 * default and a legacy excludedFromClient flag still removes a likely grouping
 * (data written before the explicit flag existed).
 *
 * NOTE: this is the legacy AI-likelihood rule, kept for the hint cards. Client
 * inclusion of the appendix + memo now runs through actingInClientReport, which
 * only surfaces the advisor's manually-built groups.
 */
export function actingInClientAnnex(a: ActingTogetherCluster): boolean {
  if (a.includeInClient != null) return a.includeInClient;
  return actingLikelyByDefault(a.likelihood) && !a.excludedFromClient;
}

/**
 * Whether an acting-together grouping reaches the client appendix and the memo.
 * The manual group builder is the leading input, so ONLY advisor-built groups
 * (origin 'manual') are client-facing, and each stays in unless the advisor hid
 * it. AI suggestions are non-binding hints: they never reach the client until the
 * advisor adopts them into a manual group (see adoptActingSuggestion).
 */
export function actingInClientReport(a: ActingTogetherCluster): boolean {
  return a.origin === 'manual' && !a.excludedFromClient;
}
