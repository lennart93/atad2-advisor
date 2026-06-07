import type { SupabaseClient } from "supabase";

export interface LoadedAppendixPrompt {
  systemPrompt: string;
  model: string;
  version: number;
  maxTokens: number;
}

export async function loadAppendixPrompt(client: SupabaseClient): Promise<LoadedAppendixPrompt> {
  const { data, error } = await client
    .from("atad2_prompts")
    .select("version, system_prompt, model, max_tokens")
    .eq("key", "appendix_system")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`Failed to load appendix prompt: ${error.message}`);
  if (!data) throw new Error("No active prompt for 'appendix_system'. Seed migration not run?");
  return {
    systemPrompt: data.system_prompt as string,
    model: data.model as string,
    version: data.version as number,
    maxTokens: data.max_tokens as number,
  };
}
