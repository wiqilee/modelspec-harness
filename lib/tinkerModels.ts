// lib/tinkerModels.ts

export type ModelBadge = "Reasoning" | "Hybrid" | "Instruction" | "Base" | "Vision";

/**
 * Option B2.2 (Professional):
 * - UI selects a stable registry id (reproducible).
 * - Backend resolves registry id -> Tinker sampler path (tinker://...).
 * - Gateway always receives sampler paths.
 */
export type ModelOption = {
  /**
   * Registry id used across UI + backend + reports.
   * You can keep familiar ids (e.g. "openai/gpt-oss-20b") as registry ids,
   * but they are NEVER sent to the Tinker gateway.
   */
  id: string;

  /** Human-friendly label for UI */
  label: string;

  badge?: ModelBadge;

  /**
   * Optional built-in sampler path for this model.
   * Must start with "tinker://".
   *
   * Leave empty if you want users to paste paths in the UI (recommended).
   */
  samplerPath?: string;
};

/**
 * Registry source of truth (id/label/badge + optional samplerPath).
 */
export const TINKER_MODEL_REGISTRY: ModelOption[] = [
  // Vision
  { id: "Qwen/Qwen3-VL-235B-A22B-Instruct", label: "Qwen3-VL 235B A22B Instruct", badge: "Vision" },
  { id: "Qwen/Qwen3-VL-30B-A3B-Instruct", label: "Qwen3-VL 30B A3B Instruct", badge: "Vision" },

  // Qwen text
  { id: "Qwen/Qwen3-235B-A22B-Instruct-2507", label: "Qwen3 235B A22B Instruct (2507)", badge: "Instruction" },
  { id: "Qwen/Qwen3-30B-A3B-Instruct-2507", label: "Qwen3 30B A3B Instruct (2507)", badge: "Instruction" },
  { id: "Qwen/Qwen3-30B-A3B", label: "Qwen3 30B A3B", badge: "Hybrid" },
  { id: "Qwen/Qwen3-30B-A3B-Base", label: "Qwen3 30B A3B Base", badge: "Base" },
  { id: "Qwen/Qwen3-32B", label: "Qwen3 32B", badge: "Hybrid" },
  { id: "Qwen/Qwen3-8B", label: "Qwen3 8B", badge: "Hybrid" },
  { id: "Qwen/Qwen3-8B-Base", label: "Qwen3 8B Base", badge: "Base" },
  { id: "Qwen/Qwen3-4B-Instruct-2507", label: "Qwen3 4B Instruct (2507)", badge: "Instruction" },

  // gpt-oss
  { id: "openai/gpt-oss-120b", label: "gpt-oss 120B", badge: "Reasoning" },
  { id: "openai/gpt-oss-20b", label: "gpt-oss 20B", badge: "Reasoning" },

  // DeepSeek
  { id: "deepseek-ai/DeepSeek-V3.1", label: "DeepSeek V3.1", badge: "Hybrid" },
  { id: "deepseek-ai/DeepSeek-V3.1-Base", label: "DeepSeek V3.1 Base", badge: "Base" },

  // Llama
  { id: "meta-llama/Llama-3.3-70B-Instruct", label: "Llama 3.3 70B Instruct", badge: "Instruction" },
  { id: "meta-llama/Llama-3.1-70B", label: "Llama 3.1 70B Base", badge: "Base" },
  { id: "meta-llama/Llama-3.1-8B-Instruct", label: "Llama 3.1 8B Instruct", badge: "Instruction" },
  { id: "meta-llama/Llama-3.1-8B", label: "Llama 3.1 8B Base", badge: "Base" },
  { id: "meta-llama/Llama-3.2-3B", label: "Llama 3.2 3B Base", badge: "Base" },
  { id: "meta-llama/Llama-3.2-1B", label: "Llama 3.2 1B Base", badge: "Base" },

  // Kimi
  { id: "moonshotai/Kimi-K2-Thinking", label: "Kimi K2 Thinking", badge: "Reasoning" },
];

export const TINKER_MODEL_IDS = new Set(TINKER_MODEL_REGISTRY.map((m) => m.id));

/**
 * Backwards-compat exports (so page.tsx / older code doesn't break).
 * Your UI can keep using OFFICIAL_TINKER_MODELS as the picker list.
 */
export const OFFICIAL_TINKER_MODELS = TINKER_MODEL_REGISTRY;

/**
 * Default auditor model (registry id).
 * NOTE: this is NOT a sampler path; it must be resolved at runtime.
 */
export const DEFAULT_AUDITOR_MODEL_ID = "moonshotai/Kimi-K2-Thinking";

/**
 * Env fallback (optional) for sampler path:
 * Used only when UI overrides + registry samplerPath are missing.
 */
export const ENV_DEFAULT_TINKER_SAMPLER_PATH = "TINKER_DEFAULT_MODEL_PATH";

export function getDefaultSamplerPathFromEnv(): string {
  return String(process.env[ENV_DEFAULT_TINKER_SAMPLER_PATH] || "").trim();
}

/**
 * Sampler path validation.
 * We only enforce the "tinker://" prefix; the rest can vary by account/run.
 */
export function isTinkerSamplerPath(path: unknown): path is string {
  return String(path ?? "").trim().startsWith("tinker://");
}

export function assertTinkerSamplerPath(path: unknown, context?: string): void {
  const p = String(path ?? "").trim();
  if (!p) {
    throw new Error(
      `Missing sampler path${context ? ` for ${context}` : ""}. Expected "tinker://...".`
    );
  }
  if (!p.startsWith("tinker://")) {
    throw new Error(
      `Invalid sampler path${context ? ` for ${context}` : ""}: "${p}". Expected "tinker://...".`
    );
  }
}

/**
 * Normalize user input so aliases become consistent registry ids.
 * If unknown, returns trimmed original (validation happens separately).
 */
export function normalizeModelInput(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s) return "";

  // If already a known registry id, keep exact casing.
  if (TINKER_MODEL_IDS.has(s)) return s;

  const k = s.toLowerCase().trim();
  const k2 = k.replace(/[_\s]+/g, "-").replace(/[^\w\-./]+/g, "");

  const aliasToId: Record<string, string> = {
    // Kimi
    "kimi-k2": "moonshotai/Kimi-K2-Thinking",
    "kimi-k2-thinking": "moonshotai/Kimi-K2-Thinking",
    "kimi-k2-think": "moonshotai/Kimi-K2-Thinking",
    "kimi-k2-reasoning": "moonshotai/Kimi-K2-Thinking",
    "moonshotai/kimi-k2-thinking": "moonshotai/Kimi-K2-Thinking",
    "kimi k2": "moonshotai/Kimi-K2-Thinking",
    "kimi k2 thinking": "moonshotai/Kimi-K2-Thinking",

    // gpt-oss
    "gpt-oss-20b": "openai/gpt-oss-20b",
    "gpt-oss-120b": "openai/gpt-oss-120b",

    // DeepSeek
    "deepseek-v3.1": "deepseek-ai/DeepSeek-V3.1",
    "deepseek-v31": "deepseek-ai/DeepSeek-V3.1",
    "deepseek v3.1": "deepseek-ai/DeepSeek-V3.1",
    "deepseek-ai/deepseek-v3.1": "deepseek-ai/DeepSeek-V3.1",
    "deepseek-v3.1-base": "deepseek-ai/DeepSeek-V3.1-Base",
    "deepseek-ai/deepseek-v3.1-base": "deepseek-ai/DeepSeek-V3.1-Base",

    // Qwen VL
    "qwen3-vl-235b-a22b-instruct": "Qwen/Qwen3-VL-235B-A22B-Instruct",
    "qwen/qwen3-vl-235b-a22b-instruct": "Qwen/Qwen3-VL-235B-A22B-Instruct",
    "qwen3-vl-30b-a3b-instruct": "Qwen/Qwen3-VL-30B-A3B-Instruct",
    "qwen/qwen3-vl-30b-a3b-instruct": "Qwen/Qwen3-VL-30B-A3B-Instruct",

    // Qwen text shortcuts
    "qwen3-235b-a22b-instruct-2507": "Qwen/Qwen3-235B-A22B-Instruct-2507",
    "qwen3-30b-a3b-instruct-2507": "Qwen/Qwen3-30B-A3B-Instruct-2507",
    "qwen3-30b-a3b": "Qwen/Qwen3-30B-A3B",
    "qwen3-30b-a3b-base": "Qwen/Qwen3-30B-A3B-Base",
    "qwen3-32b": "Qwen/Qwen3-32B",
    "qwen3-8b": "Qwen/Qwen3-8B",
    "qwen3-8b-base": "Qwen/Qwen3-8B-Base",
    "qwen3-4b-instruct-2507": "Qwen/Qwen3-4B-Instruct-2507",

    // Llama shortcuts
    "llama-3.3-70b-instruct": "meta-llama/Llama-3.3-70B-Instruct",
    "llama-3.1-70b": "meta-llama/Llama-3.1-70B",
    "llama-3.1-8b-instruct": "meta-llama/Llama-3.1-8B-Instruct",
    "llama-3.1-8b": "meta-llama/Llama-3.1-8B",
    "llama-3.2-3b": "meta-llama/Llama-3.2-3B",
    "llama-3.2-1b": "meta-llama/Llama-3.2-1B",
  };

  const hit =
    aliasToId[k] ||
    aliasToId[k2] ||
    aliasToId[k.replace(/-/g, " ")] ||
    aliasToId[k2.replace(/-/g, " ")];

  return hit || s;
}

/**
 * Registry id validation.
 */
export function isRegistryModelId(modelId: string): boolean {
  return TINKER_MODEL_IDS.has(modelId);
}

export function assertRegistryModelId(modelId: string): void {
  if (!isRegistryModelId(modelId)) {
    const examples = TINKER_MODEL_REGISTRY.slice(0, 6).map((m) => m.id).join(", ");
    throw new Error(
      `Invalid model id "${modelId}". Select models from the UI model picker. Examples: ${examples}`
    );
  }
}

/**
 * Resolve registry id -> sampler path, with precedence:
 * 1) requestOverridePaths[modelId] (UI/API payload)
 * 2) registry.samplerPath (optional hardcoded defaults)
 * 3) TINKER_DEFAULT_MODEL_PATH (env fallback, optional)
 */
export function resolveSamplerPathForModelId(
  modelId: string,
  requestOverridePaths?: Record<string, string | undefined> | null
): string {
  assertRegistryModelId(modelId);

  const fromReq = requestOverridePaths?.[modelId];
  if (fromReq && String(fromReq).trim()) {
    const p = String(fromReq).trim();
    assertTinkerSamplerPath(p, `model "${modelId}" (override)`);
    return p;
  }

  const fromRegistry = TINKER_MODEL_REGISTRY.find((m) => m.id === modelId)?.samplerPath;
  if (fromRegistry && String(fromRegistry).trim()) {
    const p = String(fromRegistry).trim();
    assertTinkerSamplerPath(p, `model "${modelId}" (registry)`);
    return p;
  }

  const fallback = getDefaultSamplerPathFromEnv();
  if (fallback) {
    assertTinkerSamplerPath(
      fallback,
      `model "${modelId}" (env fallback ${ENV_DEFAULT_TINKER_SAMPLER_PATH})`
    );
    return fallback;
  }

  throw new Error(
    `No sampler path configured for model "${modelId}". ` +
      `Paste a valid "tinker://..." path in the UI (recommended), ` +
      `or set ${ENV_DEFAULT_TINKER_SAMPLER_PATH} in .env as a fallback.`
  );
}

/**
 * Convenience:
 * - Normalize aliases -> registry id
 * - Validate registry allowlist
 */
export function normalizeAndValidateModelId(raw: unknown): string {
  const normalized = normalizeModelInput(raw);
  assertRegistryModelId(normalized);
  return normalized;
}

/**
 * Convenience:
 * - Normalize + validate -> registry id
 * - Resolve to sampler path using optional overrides
 */
export function normalizeAndResolveSamplerPath(
  raw: unknown,
  requestOverridePaths?: Record<string, string | undefined> | null
): { modelId: string; samplerPath: string } {
  const modelId = normalizeAndValidateModelId(raw);
  const samplerPath = resolveSamplerPathForModelId(modelId, requestOverridePaths);
  return { modelId, samplerPath };
}

/* ------------------------------------------------------------------
 * Compatibility exports for your updated route/page naming
 * (fixes the exact errors from your screenshot).
 * ------------------------------------------------------------------ */

/**
 * Alias used by some files: normalize "registry model id" input.
 */
export function normalizeRegistryModelIdInput(raw: unknown): string {
  return normalizeModelInput(raw);
}

/**
 * Alias used by some files: resolve registry model id -> sampler path.
 */
export function resolveRegistryModelIdToSamplerPath(
  modelId: string,
  requestOverridePaths?: Record<string, string | undefined> | null
): string {
  return resolveSamplerPathForModelId(modelId, requestOverridePaths);
}
