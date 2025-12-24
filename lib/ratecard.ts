import { ModelRate, ModelRateSchema } from "./schemas";

export const DEFAULT_RATECARD: ModelRate[] = [
  // These are placeholders. Replace with your own rate card for accurate accounting.
  { model: "tm-reasoning", input_per_1k: 0.01, output_per_1k: 0.03, currency: "USD" },
  { model: "gpt-oss-20b", input_per_1k: 0.008, output_per_1k: 0.024, currency: "USD" },
  { model: "deepseek-v3.1", input_per_1k: 0.009, output_per_1k: 0.027, currency: "USD" },
];

export function validateRatecard(rates: unknown): ModelRate[] {
  if (!Array.isArray(rates)) return DEFAULT_RATECARD;
  const parsed: ModelRate[] = [];
  for (const r of rates) {
    const v = ModelRateSchema.safeParse(r);
    if (v.success) parsed.push(v.data);
  }
  return parsed.length ? parsed : DEFAULT_RATECARD;
}

export function estimateCostUSD(
  model: string,
  inputTokens: number,
  outputTokens: number,
  rates: ModelRate[]
): number {
  const rate = rates.find((r) => r.model === model);
  if (!rate) return 0;
  const inCost = (inputTokens / 1000) * rate.input_per_1k;
  const outCost = (outputTokens / 1000) * rate.output_per_1k;
  return Number((inCost + outCost).toFixed(6));
}
