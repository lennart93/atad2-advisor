// Catalog of all editable prompts in the admin Prompts page.
// Add a new entry here whenever a prompt is added to atad2_prompts.

export type PromptKey =
  | "prefill_swarm_system"
  | "structure_stage1_initial"
  | "structure_stage1_refine"
  | "structure_stage2_initial"
  | "structure_stage2_refine"
  | "memo_system"
  | "appendix_system";

export type PromptGroup = "Pre-fill" | "Structure chart" | "Memo" | "Appendix";

export interface PromptDescriptor {
  key: PromptKey;
  label: string;
  group: PromptGroup;
  placeholders: string;
  description: string;
}

export const PROMPT_DESCRIPTORS: PromptDescriptor[] = [
  {
    key: "prefill_swarm_system",
    group: "Pre-fill",
    label: "Per-question pre-fill (swarm)",
    placeholders: "{{question_text}}, {{question_explanation}}, {{documents_block}}",
    description:
      "Produces a suggestion package (answer + confidence + toelichting + sources) for each ATAD2 question, given uploaded documents.",
  },
  {
    key: "structure_stage1_initial",
    group: "Structure chart",
    label: "Entities from documents (Phase A)",
    placeholders: "{{TAXPAYER_NAME}}",
    description:
      "First pass: pull legally and fiscally relevant entities from the uploaded documents only.",
  },
  {
    key: "structure_stage1_refine",
    group: "Structure chart",
    label: "Entities + user Q&A (Phase B)",
    placeholders: "{{TAXPAYER_NAME}}, {{EXISTING_ENTITIES_JSON}}",
    description:
      "Refine the entity list with the user's Q&A answers as authoritative.",
  },
  {
    key: "structure_stage2_initial",
    group: "Structure chart",
    label: "Ownership from documents (Phase A)",
    placeholders: "{{ENTITIES_JSON}}",
    description:
      "First pass: extract ownership edges between identified entities from documents.",
  },
  {
    key: "structure_stage2_refine",
    group: "Structure chart",
    label: "Ownership + user Q&A (Phase B)",
    placeholders: "{{ENTITIES_JSON}}, {{EXISTING_OWNERSHIP_JSON}}",
    description:
      "Refine ownership edges with the user's Q&A answers as authoritative.",
  },
  {
    key: "memo_system",
    group: "Memo",
    label: "Final memorandum (n8n)",
    placeholders:
      "{{TAXPAYER_NAME}}, {{FISCAL_YEAR}}, {{SESSION_ID}}, {{TOTAL_RISK}}, {{ANSWERS_COUNT}}, {{UNKNOWN_COUNT}}, {{RISK_CATEGORY}}, {{CORE_LOGIC_BLOCK}}, {{OVERRIDE_BLOCK}}, {{OVERRIDE_INFO_BLOCK}}, {{DOCUMENTS_BLOCK_FORMATTED}}, {{CONFIRMED_APPENDIX_BLOCK}}, {{QA_LIST}}, {{ADDITIONAL_CONTEXT_BLOCK}}",
    description:
      "System prompt the AI Agent uses to draft the final ATAD2 memorandum. The n8n 'ATAD2' workflow fetches the active version at runtime; edits here go live on the next memo generation.",
  },
  {
    key: "appendix_system",
    group: "Appendix",
    label: "Technical appendix (per-row)",
    placeholders:
      "{{TAXPAYER_NAME}}, {{FISCAL_YEAR}}, {{SESSION_ID}}, {{SKELETON_ROWS}}, {{ANSWERS_BLOCK}}, {{STRUCTURE_BLOCK}}",
    description:
      "Fills Decision + Reasoning + Reference for each fixed legal-framework row of the ATAD2 technical appendix. Decisions are limited to each row's allowed states; the Reference is internal-only and never reaches the client export.",
  },
];

// Prompts that exist in the system but are not (yet) editable via this admin
// page. Surfaced as read-only cards so the catalog is honest about coverage.
export interface ExternalPrompt {
  label: string;
  group: string;
  location: string;
  description: string;
}

export const EXTERNAL_PROMPTS: ExternalPrompt[] = [];

export const PROMPT_GROUPS: PromptGroup[] = ["Pre-fill", "Structure chart", "Memo", "Appendix"];
