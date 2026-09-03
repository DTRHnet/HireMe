import { z } from "zod";
import type { ProviderId } from "../shared/hireme";

export const providerConfigSchema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini", "openrouter", "ollama", "lmstudio", "compatible"]),
  model: z.string().min(1).max(160),
  endpoint: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).default(0.2),
  maxTokens: z.number().int().min(256).max(32000).default(4000),
  streaming: z.boolean().default(false),
});

export type ProviderConfig = z.infer<typeof providerConfigSchema>;
export type ProviderResponse = { text: string; provider: ProviderId; model: string };

const defaults: Record<ProviderId, string> = {
  openai: "https://api.openai.com/v1/chat/completions",
  anthropic: "https://api.anthropic.com/v1/messages",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  openrouter: "https://openrouter.ai/api/v1/chat/completions",
  ollama: "http://localhost:11434/v1/chat/completions",
  lmstudio: "http://localhost:1234/v1/chat/completions",
  compatible: "http://localhost:11434/v1/chat/completions",
};

export function validateProviderConfiguration(config: ProviderConfig) {
  const parsed = providerConfigSchema.parse(config);
  const endpoint = parsed.endpoint ?? defaults[parsed.provider];
  const local = parsed.provider === "ollama" || parsed.provider === "lmstudio";
  if (!local && !parsed.apiKey) return { ok: false as const, endpoint, local, error: "A provider API key is required and will be used only for this user-initiated request." };
  return { ok: true as const, endpoint, local };
}

export async function generateProviderText(config: ProviderConfig, system: string, user: string): Promise<ProviderResponse> {
  const check = validateProviderConfiguration(config);
  if (!check.ok) throw new Error(check.error);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (config.apiKey) headers.Authorization = `Bearer ${config.apiKey}`;
  const response = await fetch(check.endpoint, { method: "POST", headers, body: JSON.stringify({ model: config.model, temperature: config.temperature, max_tokens: config.maxTokens, messages: [{ role: "system", content: system }, { role: "user", content: user }] }) });
  if (!response.ok) throw new Error(`Provider request failed with status ${response.status}. Check the endpoint, model, and credentials.`);
  const data = await response.json() as { choices?: Array<{ message?: { content?: string } }>; content?: Array<{ text?: string }> };
  const text = data.choices?.[0]?.message?.content ?? data.content?.map((part) => part.text ?? "").join("") ?? "";
  if (!text) throw new Error("Provider returned no text. Retry or inspect the provider response configuration.");
  return { text, provider: config.provider, model: config.model };
}
