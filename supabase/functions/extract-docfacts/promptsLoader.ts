import type { SupabaseClient } from "supabase";

export interface LoadedPrompt {
  version: number;
  system_prompt: string;
  user_prompt_template: string;
  model: string;
  temperature: number;
  max_tokens: number;
}

export async function loadActivePrompt(client: SupabaseClient, key: string): Promise<LoadedPrompt> {
  const { data, error } = await client
    .from("atad2_prompts")
    .select("version, system_prompt, user_prompt_template, model, temperature, max_tokens")
    .eq("key", key)
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw new Error(`Failed to load prompt '${key}': ${error.message}`);
  if (!data) throw new Error(`No active prompt for '${key}'. Seed migration not run?`);
  return {
    version: data.version as number,
    system_prompt: data.system_prompt as string,
    user_prompt_template: (data.user_prompt_template as string | null) ?? "",
    model: data.model as string,
    temperature: Number(data.temperature),
    max_tokens: data.max_tokens as number,
  };
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, name) => vars[name] ?? "");
}
