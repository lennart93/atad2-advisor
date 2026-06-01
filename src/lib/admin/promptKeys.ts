// Catalog of all editable prompts in the admin Prompts page.
// Add a new entry here whenever a prompt is added to atad2_prompts.

export type PromptKey =
  | "prefill_swarm_system"
  | "structure_stage1_initial"
  | "structure_stage1_refine"
  | "structure_stage2_initial"
  | "structure_stage2_refine";

export type PromptGroup = "Pre-fill" | "Structure chart";

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
];

// Prompts that exist in the system but are not (yet) editable via this admin
// page. Surfaced as read-only cards so the catalog is honest about coverage.
export interface ExternalPrompt {
  label: string;
  group: string;
  location: string;
  description: string;
}

export const EXTERNAL_PROMPTS: ExternalPrompt[] = [
  {
    label: "Memo generation",
    group: "Memo",
    location: "n8n workflow 'ATAD2' → 'Build prompt + metrics' node",
    description:
      "Builds the final ATAD2 memorandum prompt. Currently lives inside the n8n workflow and is edited there. Moving this to atad2_prompts is planned in a follow-up.",
  },
];

export const PROMPT_GROUPS: PromptGroup[] = ["Pre-fill", "Structure chart"];
