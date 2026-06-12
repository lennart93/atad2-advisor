/**
 * Strip the model's stock opener ("Based on the available information, ...")
 * from a reasoning string and recapitalize. The qualifier belongs once in the
 * appendix intro, not at the start of every row; twelve repetitions of the
 * same seven words is noise. Mirrored in the Deno edge function so freshly
 * stored rows are clean at the source; this helper also cleans older rows in
 * the app, the print export and the memo grounding.
 */
const BOILERPLATE = /^based on (?:the )?(?:currently )?(?:available|provided) (?:information|documents|documentation|inputs|facts)[,:]?\s*/i;

export function cleanReasoning(s: string | null | undefined): string {
  if (!s) return '';
  const trimmed = s.trim();
  const stripped = trimmed.replace(BOILERPLATE, '');
  // Nothing stripped (or only the opener present): leave the text as written.
  if (!stripped || stripped === trimmed) return trimmed;
  return stripped.charAt(0).toUpperCase() + stripped.slice(1);
}
