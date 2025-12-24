import { z } from "zod";

export const RuleSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["required_fields", "forbidden_phrases", "must_admit_unknown", "max_words"]),
  severity: z.enum(["critical", "high", "medium", "low"]).default("medium"),
  // required_fields
  fields: z.array(z.string()).optional(),
  // forbidden_phrases
  phrases: z.array(z.string()).optional(),
  // must_admit_unknown
  trigger: z.string().optional(),
  required_phrase_any: z.array(z.string()).optional(),
  // max_words
  max_words: z.number().int().positive().optional(),
});

export const SpecSchema = z.object({
  id: z.string().min(1),
  domain: z.string().min(1).default("general"),
  description: z.string().optional(),
  rules: z.array(RuleSchema).min(1),
});

export const CaseSchema = z.object({
  id: z.string().min(1),
  task: z.string().min(1),
  context: z.string().optional().default(""),
});

export const ModelRateSchema = z.object({
  model: z.string().min(1),
  input_per_1k: z.number().nonnegative(),
  output_per_1k: z.number().nonnegative(),
  currency: z.string().default("USD"),
});

export type Spec = z.infer<typeof SpecSchema>;
export type Case = z.infer<typeof CaseSchema>;
export type Rule = z.infer<typeof RuleSchema>;
export type ModelRate = z.infer<typeof ModelRateSchema>;
