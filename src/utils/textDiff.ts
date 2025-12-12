/**
 * Word-by-word diff utility for track changes visualization
 */

export interface DiffToken {
  type: 'unchanged' | 'added' | 'removed';
  text: string;
}

/**
 * Split text into words while preserving whitespace and newlines
 */
function tokenize(text: string): string[] {
  // Split on whitespace but keep the delimiters
  return text.split(/(\s+)/).filter(token => token.length > 0);
}

/**
 * Compute Longest Common Subsequence (LCS) for two arrays
 */
function computeLCS(a: string[], b: string[]): number[][] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  return dp;
}

/**
 * Backtrack through LCS table to produce diff
 */
function backtrack(
  dp: number[][],
  a: string[],
  b: string[],
  i: number,
  j: number,
  result: DiffToken[]
): void {
  if (i === 0 && j === 0) {
    return;
  }

  if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
    backtrack(dp, a, b, i - 1, j - 1, result);
    result.push({ type: 'unchanged', text: a[i - 1] });
  } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
    backtrack(dp, a, b, i, j - 1, result);
    result.push({ type: 'added', text: b[j - 1] });
  } else if (i > 0) {
    backtrack(dp, a, b, i - 1, j, result);
    result.push({ type: 'removed', text: a[i - 1] });
  }
}

/**
 * Compute word-by-word diff between original and revised text
 */
export function computeTextDiff(original: string, revised: string): DiffToken[] {
  const originalTokens = tokenize(original);
  const revisedTokens = tokenize(revised);

  const dp = computeLCS(originalTokens, revisedTokens);
  const result: DiffToken[] = [];

  backtrack(dp, originalTokens, revisedTokens, originalTokens.length, revisedTokens.length, result);

  return result;
}

/**
 * Check if a token is an HTML tag
 */
function isHtmlTag(text: string): boolean {
  return /^<[^>]+>$/.test(text.trim());
}

/**
 * Render diff tokens to HTML string with track changes styling
 * Preserves HTML tags like <u>, </u>, <br>, etc.
 */
export function renderDiffToHtml(tokens: DiffToken[]): string {
  return tokens.map(token => {
    // Preserve HTML tags without escaping or styling
    if (isHtmlTag(token.text.trim())) {
      return token.text;
    }

    // For non-HTML content, only escape ampersands and convert newlines
    const processedText = token.text
      .replace(/&/g, '&amp;')
      .replace(/\n/g, '<br/>');

    switch (token.type) {
      case 'removed':
        return `<span style="color: #dc2626; text-decoration: line-through;">${processedText}</span>`;
      case 'added':
        return `<span style="color: #003366; font-style: italic;">${processedText}</span>`;
      default:
        return processedText;
    }
  }).join('');
}

/**
 * Generate full diff HTML from two text strings
 */
export function generateDiffHtml(original: string, revised: string): string {
  const tokens = computeTextDiff(original, revised);
  return renderDiffToHtml(tokens);
}
