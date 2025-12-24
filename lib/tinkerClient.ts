// lib/tinkerClient.ts
import { assertTinkerSamplerPath } from "@/lib/tinkerModels";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export type TinkerChatRequest = {
  /**
   * Option B (sampler paths only):
   * - Callers MUST pass a real Tinker sampler path:
   *     tinker://.../sampler_weights/000080
   * - This client sends that path to the OpenAI-compatible gateway as `model`.
   */
  model: string; // MUST be tinker://...
  messages: ChatMessage[];
  temperature?: number;
  max_tokens?: number;
};

export type TinkerChatResponse = {
  id?: string;
  choices?: Array<{ message?: { role?: string; content?: string } }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
};

function joinUrl(base: string, path: string) {
  const b = String(base || "").trim().replace(/\/+$/, "");
  const p = String(path || "").trim().replace(/^\/+/, "");
  return `${b}/${p}`;
}

function truncate(s: string, n = 900) {
  if (!s) return s;
  const t = String(s);
  return t.length > n ? t.slice(0, n) + "…" : t;
}

/**
 * OpenAI-compatible gateway base:
 *   https://tinker.thinkingmachines.dev/services/tinker-prod/oai/api/v1
 */
const DEFAULT_TINKER_OAI_BASE =
  "https://tinker.thinkingmachines.dev/services/tinker-prod/oai/api/v1";

function pickBaseUrlFromEnv(): string {
  const fromEnv =
    process.env.TINKER_BASE_URL ||
    process.env.TINKER_OAI_BASE_URL ||
    process.env.TINKER_API_BASE ||
    "";

  return (fromEnv || DEFAULT_TINKER_OAI_BASE).trim();
}

function hintForBaseUrl(baseUrl: string) {
  if (!baseUrl) return "";

  if (/\/services\/tinker-prod\/api\/v1\/?$/.test(baseUrl)) {
    return 'Hint: your BASE looks like ".../api/v1". For OpenAI-compatible chat/completions use ".../oai/api/v1".';
  }

  if (baseUrl.includes("/chat/completions")) {
    return "Hint: set BASE to the API root (…/v1), not the full /chat/completions path.";
  }

  if (!baseUrl.includes("/v1")) {
    return "Hint: base URL usually includes /v1 (or …/oai/api/v1).";
  }

  return "";
}

function looksLikeInvalidModel(text: string): boolean {
  const t = (text || "").toLowerCase();
  return (
    t.includes("model") &&
    (t.includes("not a valid") ||
      t.includes("invalid") ||
      t.includes("unknown model") ||
      t.includes("model not found") ||
      t.includes("model_path"))
  );
}

export async function tinkerChat(req: TinkerChatRequest): Promise<TinkerChatResponse> {
  const apiKey = (process.env.TINKER_API_KEY || "").trim();
  const baseUrl = pickBaseUrlFromEnv();

  if (!apiKey) {
    throw new Error("Missing TINKER_API_KEY. Put it in .env and restart the dev server.");
  }
  if (!baseUrl) {
    throw new Error(
      "Missing TINKER_BASE_URL (or TINKER_OAI_BASE_URL). Put it in .env and restart the dev server."
    );
  }

  const modelPath = String(req.model || "").trim();

  // Option B: hard-require a sampler path. This prevents accidental official ids.
  assertTinkerSamplerPath(modelPath, "tinkerChat(model)");

  const endpoint = joinUrl(baseUrl, "chat/completions");

  const controller = new AbortController();
  const timeoutMs = Number(process.env.TINKER_TIMEOUT_MS || "60000");
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let res: Response;
  try {
    const payload: Record<string, unknown> = {
      model: modelPath, // ✅ sampler path only
      messages: req.messages,
    };

    if (typeof req.temperature === "number") payload.temperature = req.temperature;
    if (typeof req.max_tokens === "number") payload.max_tokens = req.max_tokens;

    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (err: any) {
    const isAbort = err?.name === "AbortError";
    const baseHint = hintForBaseUrl(baseUrl);

    const msg = isAbort
      ? `Tinker request timed out after ${timeoutMs}ms.`
      : `Failed to reach Tinker API (network/DNS/VPN/firewall). ${err?.message ?? String(err)}`;

    throw new Error(
      `${msg} Endpoint: ${endpoint}${baseHint ? ` | ${baseHint}` : ""} | Tip: restart dev server after .env changes.`
    );
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const baseHint = hintForBaseUrl(baseUrl);

    const modelHint = looksLikeInvalidModel(text)
      ? ` | Model hint: gateway rejected model="${modelPath}". Ensure it is a real tinker://.../sampler_weights/... path accessible to your account.`
      : "";

    throw new Error(
      `Tinker API error (${res.status}). Endpoint: ${endpoint}. Response: ${truncate(
        text || res.statusText
      )}${baseHint ? ` | ${baseHint}` : ""}${modelHint}`
    );
  }

  return (await res.json()) as TinkerChatResponse;
}
