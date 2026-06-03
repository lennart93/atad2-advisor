import type { ReactNode } from "react";

export interface ChapterStep {
  /** Optional short heading shown above the caption. */
  heading?: string;
  /** Markdown-light caption (plain strings + line breaks). */
  caption: string | string[];
  /** Optional bullet list rendered under the caption. */
  bullets?: string[];
  /** The visual rendered as the hero of this step. */
  visual: ReactNode;
}

export interface Chapter {
  id: string;
  /** Short chapter title shown in the sidebar and progress bar. */
  title: string;
  /** Optional one-line teaser shown under the title in the sidebar. */
  teaser?: string;
  /** Chapter intro paragraph, shown above the first step. */
  intro?: string;
  /** Ordered list of steps inside this chapter. */
  steps: ChapterStep[];
  /** Only show if user has admin/moderator access. */
  adminOnly?: boolean;
}
