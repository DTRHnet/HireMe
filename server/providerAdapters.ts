import { z } from "zod";
import type { ProviderId } from "../shared/hireme";
import { ENV } from "./_core/env";

export const providerConfigSchema = z.object({
  provider: z.enum(["openai", "anthropic", "gemini", "openrouter", "ollama", "lmstudio", "compatible"]).default("openai"),
  model: z.string().min(1).max(160).default("gpt-5.6-luna"),
  endpoint: z.string().url().optional(),
  apiKey: z.string().min(1).optional(),
  temperature: z.number().min(0).max(2).default(0.2),
  omitTemperature: z.boolean().optional(),
  useMaxCompletionTokens: z.boolean().optional(),
  maxTokens: z.number().int().min(1).max(32000).default(4000),
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

export function normalizeEndpoint(provider: ProviderId, customEndpoint?: string): string {
  if (!customEndpoint) return defaults[provider];
  let url = customEndpoint.trim();
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = `https://${url}`;
  }
  url = url.replace(/\/+$/, "");

  if (provider === "anthropic") {
    if (!url.endsWith("/messages")) {
      if (url.endsWith("/v1")) return `${url}/messages`;
      return `${url}/v1/messages`;
    }
    return url;
  }

  if (url.endsWith("/responses")) return url;

  if (!url.endsWith("/chat/completions")) {
    if (url.endsWith("/v1")) return `${url}/chat/completions`;
    return `${url}/v1/chat/completions`;
  }
  return url;
}

export function validateProviderConfiguration(config: ProviderConfig) {
  const parsed = providerConfigSchema.parse(config);
  const endpoint = normalizeEndpoint(parsed.provider, parsed.endpoint);
  const local = parsed.provider === "ollama" || parsed.provider === "lmstudio";
  const hasApiKey = parsed.apiKey || (parsed.provider === "openai" && ENV.openaiApiKey);
  if (!local && !hasApiKey) {
    return { ok: false as const, endpoint, local, error: `An API key is required for ${parsed.provider}.` };
  }
  return { ok: true as const, endpoint, local };
}

export async function generateProviderText(config: ProviderConfig, system: string, user: string): Promise<ProviderResponse> {
  const check = validateProviderConfiguration(config);
  if (!check.ok) throw new Error(check.error);

  const isAnthropic = config.provider === "anthropic";
  const modelLower = config.model.toLowerCase();
  const isLuna = modelLower === "gpt-5.6-luna";
  const isOpenAI = config.provider === "openai" || modelLower.includes("gpt-5") || modelLower.startsWith("o1") || modelLower.startsWith("o3");
  const endpoint = isLuna && check.endpoint.endsWith("/chat/completions")
    ? check.endpoint.replace(/\/chat\/completions$/, "/responses")
    : check.endpoint;

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  const apiKey = config.apiKey || (config.provider === "openai" ? ENV.openaiApiKey : "");
  if (isAnthropic) {
    if (apiKey) headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  } else if (apiKey) {
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  // Pre-detect strict reasoning models
  const isReasoningModel = modelLower.startsWith("o1") || modelLower.startsWith("o3") || modelLower.includes("luna") || modelLower.includes("reasoning");

  let includeTemperature = !config.omitTemperature && !isReasoningModel;
  let useMaxCompletionTokens = config.useMaxCompletionTokens ?? isOpenAI;
  let combineSystemWithUser = false;

  const buildBody = () => {
    if (isLuna) {
      return {
        model: config.model,
        input: `[SYSTEM INSTRUCTION]\n${system}\n\n[USER INPUT]\n${user}`,
        reasoning: { effort: "medium" },
        max_output_tokens: 8192,
      };
    }
    if (isAnthropic) {
      return {
        model: config.model,
        max_tokens: config.maxTokens,
        ...(includeTemperature ? { temperature: config.temperature } : {}),
        system,
        messages: [{ role: "user", content: user }],
      };
    }

    const tokenParam = useMaxCompletionTokens
      ? { max_completion_tokens: config.maxTokens }
      : { max_tokens: config.maxTokens };

    if (combineSystemWithUser) {
      return {
        model: config.model,
        ...(includeTemperature ? { temperature: config.temperature } : {}),
        ...tokenParam,
        messages: [
          { role: "user", content: `[SYSTEM INSTRUCTION]\n${system}\n\n[USER INPUT]\n${user}` }
        ],
      };
    }

    return {
      model: config.model,
      ...(includeTemperature ? { temperature: config.temperature } : {}),
      ...tokenParam,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    };
  };

  let response: Response | undefined;
  let lastErrorDetail = "";

  // Retry loop: up to 3 attempts with adaptive parameter adjustment
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(buildBody()),
      });

      if (response.ok) break;

      if (response.status === 400) {
        const cloneResp = response.clone();
        lastErrorDetail = await cloneResp.text().catch(() => "");

        let adapted = false;

        // If temperature is unsupported by this model, strip it and retry
        if (includeTemperature && (lastErrorDetail.includes("temperature") || lastErrorDetail.includes("default (1)"))) {
          includeTemperature = false;
          adapted = true;
        }

        // If max_tokens or max_completion_tokens is unsupported, swap and retry
        if (!adapted && (lastErrorDetail.includes("max_completion_tokens") || lastErrorDetail.includes("max_tokens"))) {
          useMaxCompletionTokens = !useMaxCompletionTokens;
          adapted = true;
        }

        // If system role is unsupported, merge system prompt into user prompt and retry
        if (!adapted && !combineSystemWithUser && (lastErrorDetail.includes("system") || lastErrorDetail.includes("developer"))) {
          combineSystemWithUser = true;
          adapted = true;
        }

        if (adapted) continue;
      }

      break;
    } catch (err: any) {
      throw new Error(`Failed to reach endpoint (${endpoint}): ${err.message || String(err)}`);
    }
  }

  if (!response || !response.ok) {
    let detail = lastErrorDetail;
    if (response && !detail) {
      try {
        const errJson = await response.json();
        detail = errJson.error?.message || errJson.message || errJson.error || JSON.stringify(errJson);
      } catch {
        detail = await response.text().catch(() => response.statusText);
      }
    }
    const status = response ? response.status : "Error";
    throw new Error(`Provider returned error (${status}): ${detail || (response ? response.statusText : "Unknown error")}`);
  }

  const data = (await response.json()) as any;
  let text = "";
  if (isLuna) {
    text = data.output_text ?? data.output
      ?.flatMap((item: any) => item.content ?? [])
      ?.map((part: any) => part.text ?? "")
      ?.join("") ?? "";
  } else if (isAnthropic) {
    text = data.content?.map((part: any) => part.text ?? "").join("") ?? "";
  } else {
    text = data.choices?.[0]?.message?.content ?? data.content?.map((part: any) => part.text ?? "").join("") ?? "";
  }

  if (!text) throw new Error("Provider returned no text. Verify the model output and configuration.");
  return { text, provider: config.provider, model: config.model };
}

export async function testProviderConnection(config: ProviderConfig): Promise<{ ok: boolean; message?: string; error?: string }> {
  try {
    const check = validateProviderConfiguration(config);
    if (!check.ok) return { ok: false, error: check.error };

    const testConfig = { ...config, maxTokens: 16 };
    const res = await generateProviderText(testConfig, "You are a test assistant.", "Say hello.");
    if (res.text) {
      return { ok: true, message: `Successfully connected to ${config.provider} using model "${config.model}".` };
    }
    return { ok: false, error: "Provider connected but returned an empty response." };
  } catch (err: any) {
    return { ok: false, error: err.message || "Connection test failed." };
  }
}

