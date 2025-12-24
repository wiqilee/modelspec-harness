import { Case, Spec } from "./schemas";

export type Violation = {
  rule_id: string;
  severity: "critical" | "high" | "medium" | "low";
  evidence: string;
  explanation: string;
};

export type ComplianceResult = {
  case_id: string;
  model: string;
  pass: boolean;
  violations: Violation[];
  word_count: number;
};

function safeString(v: unknown): string {
  return typeof v === "string" ? v : String(v ?? "");
}

function includesInsensitive(haystack: unknown, needle: unknown): boolean {
  const h = safeString(haystack).toLowerCase();
  const n = safeString(needle).toLowerCase();
  if (!n) return false;
  return h.includes(n);
}

function countWords(text: unknown): number {
  const s = safeString(text).trim();
  if (!s) return 0;
  return s.split(/\s+/).filter(Boolean).length;
}

export function localRuleChecks(spec: Spec, c: Case, response: string): Violation[] {
  const violations: Violation[] = [];

  const resp = safeString(response);
  const ctx = `${safeString(c.task)} ${safeString(c.context)}`;
  const wc = countWords(resp);

  for (const rule of spec.rules) {
    if (rule.type === "required_fields") {
      const fields = rule.fields || [];
      for (const field of fields) {
        if (!includesInsensitive(resp, field)) {
          violations.push({
            rule_id: rule.id,
            severity: rule.severity ?? "medium",
            evidence: safeString(field),
            explanation: `Missing required field: ${safeString(field)}`,
          });
          // One missing field is enough to flag the rule once
          break;
        }
      }
      continue;
    }

    if (rule.type === "forbidden_phrases") {
      const phrases = rule.phrases || [];
      const hit = phrases.find((p) => includesInsensitive(resp, p));
      if (hit) {
        violations.push({
          rule_id: rule.id,
          severity: rule.severity ?? "medium",
          evidence: safeString(hit),
          explanation: `Contains forbidden phrase: "${safeString(hit)}"`,
        });
      }
      continue;
    }

    if (rule.type === "must_admit_unknown") {
      const trigger = rule.trigger;
      if (trigger && includesInsensitive(ctx, trigger)) {
        const required = rule.required_phrase_any || [];
        const ok = required.some((p) => includesInsensitive(resp, p));
        if (!ok && required.length > 0) {
          violations.push({
            rule_id: rule.id,
            severity: rule.severity ?? "medium",
            evidence: safeString(trigger),
            explanation: `Did not admit uncertainty for trigger "${safeString(
              trigger
            )}". Expected one of: ${required.map(safeString).join(", ")}`,
          });
        }
      }
      continue;
    }

    if (rule.type === "max_words") {
      if (typeof rule.max_words === "number" && wc > rule.max_words) {
        violations.push({
          rule_id: rule.id,
          severity: rule.severity ?? "medium",
          evidence: String(wc),
          explanation: `Response exceeds max word count (${wc} > ${rule.max_words}).`,
        });
      }
      continue;
    }
  }

  return violations;
}

export function summarizePass(violations: Violation[]): boolean {
  // Enterprise convention: any critical violation fails the case;
  // other severities are reported but do not hard-fail.
  return !violations.some((v) => v.severity === "critical");
}

export function buildSystemPrompt(spec: Spec): string {
  // This prompt is used ONLY when you run "tinker auditor (strict JSON verdict)" mode.
  // It must force JSON-only output.
  const policyJson = JSON.stringify(spec, null, 2);

  return [
    "You are a strict compliance auditor.",
    "You will be given a POLICY (spec) and an AI RESPONSE.",
    "Return ONLY valid JSON. Do not include any prose, markdown, or code fences.",
    "",
    "Return JSON exactly with this schema:",
    '{ "pass": boolean, "violations": [{"rule_id": string, "severity": "critical"|"high"|"medium"|"low", "evidence": string, "explanation": string}] }',
    "",
    "POLICY (JSON):",
    policyJson,
  ].join("\n");
}
