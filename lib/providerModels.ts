// lib/providerModels.ts
export type Provider = "openai" | "groq";

export type ProviderModelOption = {
  id: string; // e.g. "openai:gpt-4.1-mini" or "groq:llama-3.1-70b-versatile"
  label: string;
  provider: Provider;
  badge?: "Reasoning" | "Fast" | "Base";
};

export const MODEL_REGISTRY: ProviderModelOption[] = [
  // OpenAI (examples - change to whatever your account supports)
  { id: "openai:gpt-4.1-mini", label: "GPT-4.1 mini", provider: "openai", badge: "Base" },
  { id: "openai:gpt-4o-mini", label: "GPT-4o mini", provider: "openai", badge: "Fast" },

  // Groq (examples - change if needed)
  { id: "groq:llama-3.1-70b-versatile", label: "Llama 3.1 70B Versatile", provider: "groq", badge: "Fast" },
  { id: "groq:llama-3.1-8b-instant", label: "Llama 3.1 8B Instant", provider: "groq", badge: "Fast" },
];

export const DEFAULT_SELECTED_MODELS = [
  "openai:gpt-4o-mini",
  "groq:llama-3.1-70b-versatile",
];

export const DEFAULT_AUDITOR_MODEL_ID = "openai:gpt-4o-mini";

export function parseProviderModelId(id: string): { provider: Provider; model: string } {
  const s = String(id || "").trim();
  const m = s.match(/^(openai|groq)\:(.+)$/i);
  if (!m) throw new Error(`Invalid model id "${id}". Expected "openai:<model>" or "groq:<model>".`);
  const provider = m[1].toLowerCase() as Provider;
  const model = m[2].trim();
  if (!model) throw new Error(`Invalid model id "${id}". Missing model name after provider prefix.`);
  return { provider, model };
}

export function assertRegistryModelId(id: string) {
  const ok = MODEL_REGISTRY.some((m) => m.id === id);
  if (!ok) throw new Error(`Model "${id}" is not in registry.`);
}
