// Loads the four active structure-extraction prompts from atad2_prompts.
// Replaces the hardcoded TS prompt files that lived in prompts/ — so the
// admin Prompts page is the single source of truth for prompt text.

import type { SupabaseClient } from "supabase";

export interface LoadedStructurePrompts {
  stage1_initial: string;
  stage1_refine: string;
  stage2_initial: string;
  stage2_refine: string;
}

const KEYS = [
  "structure_stage1_initial",
  "structure_stage1_refine",
  "structure_stage2_initial",
  "structure_stage2_refine",
] as const;

export async function loadStructurePrompts(
  client: SupabaseClient,
): Promise<LoadedStructurePrompts> {
  const { data, error } = await client
    .from("atad2_prompts")
    .select("key, system_prompt")
    .in("key", KEYS as unknown as string[])
    .eq("is_active", true);
  if (error) {
    throw new Error(`Failed to load structure prompts: ${error.message}`);
  }
  const byKey = new Map<string, string>();
  for (const row of data ?? []) {
    byKey.set(row.key as string, row.system_prompt as string);
  }
  for (const k of KEYS) {
    if (!byKey.has(k)) {
      throw new Error(`Missing active prompt row for key '${k}' in atad2_prompts`);
    }
  }
  return {
    stage1_initial: byKey.get("structure_stage1_initial")!,
    stage1_refine: byKey.get("structure_stage1_refine")!,
    stage2_initial: byKey.get("structure_stage2_initial")!,
    stage2_refine: byKey.get("structure_stage2_refine")!,
  };
}
