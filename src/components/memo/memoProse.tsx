import React from "react";
import type { Components } from "react-markdown";
import rehypeRaw from "rehype-raw";
import { rehypeSanitizeMemo } from "./sanitizeMemoHtml";

/**
 * Shared memo prose renderer config.
 *
 * Used by both the memo reader (whole memo, in `AssessmentReport`) and the
 * feedback editor (one commentable block per paragraph, in `MemoFeedbackEditor`)
 * so the reading column looks identical whether or not you are in edit mode.
 * Editorial reader style: a confident ink body at a comfortable measure, quiet
 * underlined section headings. Margins are marked important so they win over the
 * Tailwind Typography (`prose`) base the wrapper carries.
 */

const MemoHeading: React.FC<{ children?: React.ReactNode }> = ({ children }) => (
  // Rendered as a block <p>, not an <h*> tag, so the `prose` heading styles do
  // not fight it. `w-fit` keeps the underline hugging the text, not the column.
  <p className="!mt-8 !mb-2 block w-fit text-[15px] font-medium text-ds-ink underline decoration-[#cfc9bd] [text-underline-offset:3px] first:!mt-0">
    {children}
  </p>
);

export const memoMarkdownComponents: Components = {
  u: ({ children }) => (
    <span className="underline [text-underline-offset:3px]">{children}</span>
  ),
  p: ({ children }) => (
    <p className="!my-0 !mb-4 text-[16px] leading-[1.62] text-ds-ink last:!mb-0">{children}</p>
  ),
  h1: ({ children }) => <MemoHeading>{children}</MemoHeading>,
  h2: ({ children }) => <MemoHeading>{children}</MemoHeading>,
  h3: ({ children }) => <MemoHeading>{children}</MemoHeading>,
  h4: ({ children }) => <MemoHeading>{children}</MemoHeading>,
  h5: ({ children }) => <MemoHeading>{children}</MemoHeading>,
  h6: ({ children }) => <MemoHeading>{children}</MemoHeading>,
  ul: ({ children }) => <ul className="!mb-4 !mt-1 list-disc pl-5">{children}</ul>,
  li: ({ children }) => (
    <li className="!mb-1 text-[16px] leading-[1.62] text-ds-ink">{children}</li>
  ),
  br: () => <br />,
  sup: ({ children }) => <sup>{children}</sup>,
  sub: ({ children }) => <sub>{children}</sub>,
};

/**
 * The wrapper class the memo prose lives in. `prose` gives the base rhythm;
 * `memoMarkdownComponents` overrides colour, size and headings on top. Kept as a
 * shared constant so the reader and the per-paragraph editor blocks match.
 */
export const MEMO_PROSE_CLASS =
  "markdown-body prose prose-base dark:prose-invert max-w-none text-left";

/**
 * Hardened rehype plugin list for ALL memo rendering. `rehype-raw` keeps the
 * model's inline formatting tags (<u>/<sup>/<sub>/<br>); `rehypeSanitizeMemo`
 * MUST follow it to strip script/iframe/svg/event-handler injection (memo text
 * is derived from untrusted uploaded documents). Every `<ReactMarkdown>` that
 * renders memo content must use this constant, never a bare `[rehypeRaw]`.
 */
export const MEMO_REHYPE_PLUGINS = [rehypeRaw, rehypeSanitizeMemo];
