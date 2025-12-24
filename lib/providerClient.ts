// lib/providerClient.ts
import OpenAI from "openai";
import { parseProviderModelId, type Provider } from "@/lib/providerModels";

const timeoutMs = Number(process.env.PROVIDER_TIMEOUT_MS || "60000");

function makeOpenAIClient(baseURL: string, apiKey: string) {
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  return new OpenAI({ apiKey, baseURL, timeout: timeoutMs });
}

function makeGroqClient(baseURL: string, apiKey: string) {
  if (!apiKey) throw new Error("Missing GROQ_API_KEY");
  // Groq is OpenAI-compatible at /openai/v1
  return new OpenAI({ apiKey, baseURL, timeout: timeoutMs });
}

function getClient(provider: Provider) {
  if (provider === "openai") {
    return makeOpenAIClient(
      (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim(),
      (process.env.OPENAI_API_KEY || "").trim()
    );
  }
  return makeGroqClient(
    (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").trim(),
    (process.env.GROQ_API_KEY || "").trim()
  );
}

export async function providerChat(args: {
  modelId: string; // e.g. "openai:gpt-4o-mini"
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  temperature?: number;
  max_tokens?: number;
}) {
  const { provider, model } = parseProviderModelId(args.modelId);
  const client = getClient(provider);

  // OpenAI SDK method works for both OpenAI + Groq OpenAI-compatible endpoints
  return client.chat.completions.create({
    model,
    messages: args.messages,
    temperature: args.temperature,
    max_tokens: args.max_tokens,
  });
}
