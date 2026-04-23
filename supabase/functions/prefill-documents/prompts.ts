import type { SupabaseClient } from "supabase";

export type PromptKey = "prefill_stage1_system" | "prefill_stage2_system";

export interface LoadedPrompt {
  version: number;
  system_prompt: string;
  user_prompt_template: string;
  model: string;
  temperature: number;
  max_tokens: number;
}

interface CacheEntry {
  prompt: LoadedPrompt;
  loadedAt: number;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<PromptKey, CacheEntry>();

export async function loadActivePrompt(
  serviceClient: SupabaseClient,
  key: PromptKey,
): Promise<LoadedPrompt> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && now - hit.loadedAt < CACHE_TTL_MS) return hit.prompt;

  const { data, error } = await serviceClient
    .from("atad2_prompts")
    .select("version, system_prompt, user_prompt_template, model, temperature, max_tokens")
    .eq("key", key)
    .eq("is_active", true)
    .maybeSingle();

  if (error) throw new Error(`Failed to load prompt ${key}: ${error.message}`);
  if (!data) throw new Error(`No active prompt for ${key}. Seed migration not run?`);

  const prompt: LoadedPrompt = {
    version: data.version,
    system_prompt: data.system_prompt,
    user_prompt_template: data.user_prompt_template ?? "",
    model: data.model,
    temperature: Number(data.temperature),
    max_tokens: data.max_tokens,
  };
  cache.set(key, { prompt, loadedAt: now });
  return prompt;
}

export function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_m, name) => vars[name] ?? "");
}

export function clearPromptCache(): void {
  cache.clear();
}
