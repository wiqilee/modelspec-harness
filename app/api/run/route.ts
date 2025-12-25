// app/api/run/route.ts
import { NextResponse } from "next/server";
import yaml from "js-yaml";
import pLimit from "p-limit";

import { CaseSchema, SpecSchema } from "@/lib/schemas";
import { buildSystemPrompt, localRuleChecks, summarizePass } from "@/lib/evaluator";
import { estimateCostUSD, validateRatecard } from "@/lib/ratecard";

// IMPORTANT: this must be the ONLY import for PDF/HTML/CSV generation.
import { toCSV, toHTML, toPDF } from "@/lib/reporters";

import { writeRunFile } from "@/lib/storage";
import type { ComplianceRow, RunBundle } from "@/lib/types";

// Provider routing (OpenAI + Groq)
import {
  MODEL_REGISTRY,
  DEFAULT_AUDITOR_MODEL_ID,
  assertRegistryModelId,
} from "@/lib/providerModels";
import { providerChat } from "@/lib/providerClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Backward compatible with older UI values ("tinker")
type VerifierMode = "llm_auditor" | "local_only";

type RunRequest = {
  specYaml: string;
  cases: Array<{ id: string; task: string; context?: string }>;
  models: string[]; // provider-prefixed ids
  settings?: { temperature?: number; max_tokens?: number; concurrency?: number };
  ratecard?: any[];
  verifierMode?: VerifierMode | "tinker";
  auditorModel?: string;
};

type JobError = {
  case_id: string;
  model: string;
  stage: "generate" | "audit" | "unknown";
  status?: number;
  message: string;
};

type ArtifactStatus = {
  name: string;
  available: boolean;
  bytes?: number;
  error?: string;
  createdAt: string;
};

type RunMeta = {
  runId: string;
  createdAt: string;
  specId?: string;
  selected_model_ids?: string[];
  concurrency?: number;
  verifierMode?: VerifierMode;
  auditorModel?: string;
  env?: any;
  jobErrors?: JobError[];
  fatal?: boolean;
  error?: string;
  artifacts?: {
    html: ArtifactStatus;
    csv: ArtifactStatus;
    jsonl: ArtifactStatus;
    pdf: ArtifactStatus;
  };
  warnings?: string[];
};

type InlineArtifacts = {
  html?: { name: string; content: string; bytes: number };
  csv?: { name: string; content: string; bytes: number };
  jsonl?: { name: string; content: string; bytes: number };
  pdf?: { name: string; base64: string; bytes: number };
};

function safeString(x: unknown) {
  if (typeof x === "string") return x;
  if (x === null || x === undefined) return "";
  return String(x);
}

function normalizeModels(models: unknown): string[] {
  if (!Array.isArray(models)) return [];
  return models
    .map((m) => safeString(m).trim())
    .filter(Boolean)
    .filter((m, i, arr) => arr.indexOf(m) === i);
}

function extractHttpStatus(msg: string): number | undefined {
  const paren = msg.match(/error\s*\((\d{3})\)/i);
  if (paren) {
    const code = Number(paren[1]);
    if (Number.isFinite(code) && code >= 100 && code <= 599) return code;
  }
  const m = msg.match(/\b(\d{3})\b/);
  if (!m) return undefined;
  const code = Number(m[1]);
  if (Number.isFinite(code) && code >= 100 && code <= 599) return code;
  return undefined;
}

function makeRunId() {
  const c = globalThis.crypto as unknown as { randomUUID?: () => string } | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function nowIso() {
  return new Date().toISOString();
}

function byteLenUtf8(x: string) {
  return Buffer.byteLength(x, "utf8");
}

function envDiagnostics() {
  const openaiBase = (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim();
  const groqBase = (process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1").trim();

  return {
    openai: {
      has_key: Boolean((process.env.OPENAI_API_KEY || "").trim()),
      base_url: openaiBase,
    },
    groq: {
      has_key: Boolean((process.env.GROQ_API_KEY || "").trim()),
      base_url: groqBase,
    },
  };
}

/**
 * Vercel serverless filesystem is ephemeral and often not safe to rely on for artifacts.
 * If persistence is disabled, we still generate artifacts but return them inline in the response.
 */
function isRunsPersistenceEnabled(): boolean {
  if (process.env.DISABLE_RUNS_PERSIST === "1") return false;
  if (process.env.FORCE_RUNS_PERSIST === "1") return true;
  if (process.env.VERCEL === "1") return false;
  return true;
}

// Defensive: supports writeRunFile being sync or async
async function safeWriteRunFile(runId: string, name: string, data: string | Buffer) {
  const fnUnknown: unknown = writeRunFile;
  const fn = fnUnknown as (runId: string, name: string, data: unknown) => unknown;
  await Promise.resolve(fn(runId, name, data));
}

function normalizeVerifierMode(v: unknown): VerifierMode {
  const s = safeString(v).trim();
  if (s === "local_only") return "local_only";
  if (s === "tinker") return "llm_auditor"; // legacy UI value
  return "llm_auditor";
}

export async function POST(req: Request) {
  const runId = makeRunId();
  const createdAt = nowIso();

  const baseMeta: RunMeta = { runId, createdAt };
  const persistenceEnabled = isRunsPersistenceEnabled();

  // Seed meta.json early (best-effort). On Vercel this may be a no-op.
  try {
    const seedMeta: RunMeta = {
      ...baseMeta,
      artifacts: {
        html: { name: "report.html", available: false, createdAt },
        csv: { name: "compliance_table.csv", available: false, createdAt },
        jsonl: { name: "violations.jsonl", available: false, createdAt },
        pdf: { name: "report.pdf", available: false, createdAt },
      },
      warnings: [],
      jobErrors: [],
    };
    await safeWriteRunFile(runId, "meta.json", JSON.stringify(seedMeta, null, 2));
  } catch {
    // ignore
  }

  try {
    const body = (await req.json()) as RunRequest;

    // Validate & parse spec YAML
    const specObj = yaml.load(body.specYaml);
    const specParsed = SpecSchema.safeParse(specObj);
    if (!specParsed.success) {
      return NextResponse.json(
        { error: "Invalid spec YAML.", details: specParsed.error.flatten() },
        { status: 400 }
      );
    }
    const spec = specParsed.data;

    // Validate cases
    if (!Array.isArray(body.cases) || body.cases.length === 0) {
      return NextResponse.json({ error: "Add at least one test case." }, { status: 400 });
    }

    const cases = body.cases.map((c) => {
      const parsed = CaseSchema.safeParse({
        id: safeString(c?.id),
        task: safeString(c?.task),
        context: safeString(c?.context ?? ""),
      });
      if (!parsed.success) {
        throw new Error(
          `Invalid test case. Ensure each case has { id, task }. Offending case id: "${safeString(
            c?.id
          )}"`
        );
      }
      return parsed.data;
    });

    // Validate selected models
    const rawModelIds = normalizeModels(body.models);
    if (rawModelIds.length === 0) {
      return NextResponse.json({ error: "No models selected." }, { status: 400 });
    }

    let modelIds: string[] = [];
    try {
      rawModelIds.forEach(assertRegistryModelId);
      modelIds = rawModelIds;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Invalid model id(s).";
      return NextResponse.json(
        {
          error: msg || "Invalid model id(s). Select models from the registry list.",
          debug: { selected: rawModelIds, allowed: MODEL_REGISTRY.map((m) => m.id) },
        },
        { status: 400 }
      );
    }

    // Settings
    const concurrency = Math.min(Math.max(body.settings?.concurrency ?? 4, 1), 20);
    const limit = pLimit(concurrency);

    const temperature =
      typeof body.settings?.temperature === "number" ? body.settings.temperature : 0.2;
    const max_tokens =
      typeof body.settings?.max_tokens === "number" ? body.settings.max_tokens : 512;

    const rates = validateRatecard(body.ratecard);

    const verifierMode: VerifierMode = normalizeVerifierMode(body.verifierMode);

    // Auditor model — only validated if used
    const rawAuditor = safeString(body.auditorModel).trim();
    const auditorModelId = rawAuditor || DEFAULT_AUDITOR_MODEL_ID;

    if (verifierMode === "llm_auditor") {
      try {
        assertRegistryModelId(auditorModelId);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : `Invalid auditor model "${auditorModelId}".`;
        return NextResponse.json(
          {
            error: msg,
            debug: { auditorModelId, allowed: MODEL_REGISTRY.map((m) => m.id) },
          },
          { status: 400 }
        );
      }
    }

    const auditorSystemPrompt = buildSystemPrompt(spec);

    // Collectors
    const rows: ComplianceRow[] = [];
    const violationsJsonl: string[] = [];
    const jobErrors: JobError[] = [];

    // Jobs
    const jobs: Array<Promise<void>> = [];

    for (const c of cases) {
      for (const modelId of modelIds) {
        jobs.push(
          limit(async () => {
            const t0 = Date.now();

            let genInTok = 0;
            let genOutTok = 0;
            let auditInTok = 0;
            let auditOutTok = 0;

            let content = "";

            // Generation
            try {
              const gen = await providerChat({
                modelId,
                messages: [
                  {
                    role: "system",
                    content: c.context?.trim()
                      ? c.context.trim()
                      : "You are a helpful assistant.",
                  },
                  { role: "user", content: c.task },
                ],
                temperature,
                max_tokens,
              });

              const gAny = gen as unknown as any;
              content = gAny?.choices?.[0]?.message?.content ?? "";
              genInTok = gAny?.usage?.prompt_tokens ?? 0;
              genOutTok = gAny?.usage?.completion_tokens ?? 0;
            } catch (e: unknown) {
              const msg = safeString((e as any)?.message) || "Generation failed.";
              const status = extractHttpStatus(msg);

              jobErrors.push({
                case_id: c.id,
                model: modelId,
                stage: "generate",
                status,
                message: msg,
              });
              return;
            }

            const localViolations = localRuleChecks(spec, c, content);
            let verdictPass = summarizePass(localViolations);
            let auditViolations: any[] = [];

            // Optional auditor verification
            if (verifierMode === "llm_auditor") {
              try {
                const audit = await providerChat({
                  modelId: auditorModelId,
                  messages: [
                    { role: "system", content: auditorSystemPrompt },
                    {
                      role: "user",
                      content: JSON.stringify({ case: c, model_response: content }),
                    },
                  ],
                  temperature: 0,
                  max_tokens: 700,
                });

                const aAny = audit as unknown as any;
                auditInTok = aAny?.usage?.prompt_tokens ?? 0;
                auditOutTok = aAny?.usage?.completion_tokens ?? 0;

                const raw = aAny?.choices?.[0]?.message?.content ?? "{}";

                try {
                  const parsed = JSON.parse(raw);
                  auditViolations = Array.isArray(parsed.violations) ? parsed.violations : [];
                  if (typeof parsed.pass === "boolean") verdictPass = parsed.pass;
                } catch {
                  // If auditor returns non-JSON, keep local verdict.
                }
              } catch (e: unknown) {
                const msg = safeString((e as any)?.message) || "Audit failed.";
                const status = extractHttpStatus(msg);

                jobErrors.push({
                  case_id: c.id,
                  model: modelId,
                  stage: "audit",
                  status,
                  message: msg,
                });
                // Continue with local verdict.
              }
            }

            const latency = Date.now() - t0;

            const cost = estimateCostUSD(
              modelId,
              genInTok + auditInTok,
              genOutTok + auditOutTok,
              rates
            );

            const allViolations = [
              ...localViolations,
              ...auditViolations.map((v: any) => ({
                rule_id: String(v.rule_id ?? "auditor"),
                severity: (v.severity ?? "medium") as any,
                evidence: String(v.evidence ?? ""),
                explanation: String(v.explanation ?? "Auditor-reported violation."),
              })),
            ];

            const counts = { critical: 0, high: 0, medium: 0, low: 0 } as Record<string, number>;
            for (const v of allViolations) {
              const sev = String((v as any).severity ?? "medium");
              counts[sev] = (counts[sev] ?? 0) + 1;
            }

            rows.push({
              case_id: c.id,
              model: modelId,
              pass: verdictPass ? 1 : 0,
              critical: counts.critical ?? 0,
              high: counts.high ?? 0,
              medium: counts.medium ?? 0,
              low: counts.low ?? 0,
              latency_ms: latency,
              input_tokens: genInTok + auditInTok,
              output_tokens: genOutTok + auditOutTok,
              cost_usd: cost,
            });

            violationsJsonl.push(
              JSON.stringify({
                case_id: c.id,
                model: modelId,
                auditor_model: verifierMode === "llm_auditor" ? auditorModelId : null,
                pass: verdictPass,
                response: content,
                violations: allViolations,
                latency_ms: latency,
                input_tokens: genInTok + auditInTok,
                output_tokens: genOutTok + auditOutTok,
                cost_usd: cost,
              })
            );
          })
        );
      }
    }

    await Promise.allSettled(jobs);

    const envDiag = envDiagnostics();

    // If everything failed
    if (rows.length === 0) {
      const meta: RunMeta = {
        ...baseMeta,
        specId: spec.id,
        selected_model_ids: modelIds,
        concurrency,
        verifierMode,
        auditorModel: verifierMode === "llm_auditor" ? auditorModelId : undefined,
        env: envDiag,
        jobErrors,
        artifacts: {
          html: { name: "report.html", available: false, createdAt },
          csv: { name: "compliance_table.csv", available: false, createdAt },
          jsonl: { name: "violations.jsonl", available: false, createdAt },
          pdf: { name: "report.pdf", available: false, createdAt },
        },
        warnings: ["All model-runs failed. No artifacts were generated."],
      };

      // best-effort
      try {
        await safeWriteRunFile(runId, "meta.json", JSON.stringify(meta, null, 2));
      } catch {
        // ignore (Vercel/demo mode)
      }

      return NextResponse.json(
        {
          error: "All model-runs failed.",
          hint:
            "Common causes: missing/invalid provider API keys, unsupported model name, base URL mismatch, quota/credit limits, or network/timeout.",
          env: envDiag,
          details: jobErrors.slice(0, 50),
          runId,
        },
        { status: 500 }
      );
    }

    // Totals
    const byModelMap = new Map<
      string,
      { total: number; pass: number; latencySum: number; costSum: number }
    >();

    for (const r of rows) {
      const cur = byModelMap.get(r.model) ?? { total: 0, pass: 0, latencySum: 0, costSum: 0 };
      cur.total += 1;
      cur.pass += r.pass;
      cur.latencySum += r.latency_ms;
      cur.costSum += r.cost_usd;
      byModelMap.set(r.model, cur);
    }

    const totals = {
      totalCases: cases.length,
      totalRows: rows.length,
      byModel: Array.from(byModelMap.entries()).map(([model, v]) => ({
        model,
        total: v.total,
        pass: v.pass,
        avg_latency_ms: v.latencySum / Math.max(1, v.total),
        cost_usd: v.costSum,
      })),
    };

    const bundle: RunBundle = {
      runId,
      specId: spec.id,
      createdAt,
      rows: rows
        .slice()
        .sort((a, b) =>
          a.case_id === b.case_id ? a.model.localeCompare(b.model) : a.case_id.localeCompare(b.case_id)
        ),
      totals,
    };

    const warnings: string[] = [];
    const inline: InlineArtifacts = {};

    const artifactStatus = {
      html: { name: "report.html", available: false, createdAt: nowIso() } as ArtifactStatus,
      csv: { name: "compliance_table.csv", available: false, createdAt: nowIso() } as ArtifactStatus,
      jsonl: { name: "violations.jsonl", available: false, createdAt: nowIso() } as ArtifactStatus,
      pdf: { name: "report.pdf", available: false, createdAt: nowIso() } as ArtifactStatus,
    };

    // violations.jsonl
    let jsonlContent = "";
    try {
      jsonlContent = (violationsJsonl.length ? violationsJsonl.join("\n") : "") + "\n";
      if (persistenceEnabled) {
        await safeWriteRunFile(runId, "violations.jsonl", jsonlContent);
      } else {
        inline.jsonl = {
          name: "violations.jsonl",
          content: jsonlContent,
          bytes: byteLenUtf8(jsonlContent),
        };
      }
      artifactStatus.jsonl.available = true;
      artifactStatus.jsonl.bytes = byteLenUtf8(jsonlContent);
      artifactStatus.jsonl.createdAt = nowIso();
    } catch (e: unknown) {
      artifactStatus.jsonl.available = false;
      artifactStatus.jsonl.error = safeString((e as any)?.message) || "Failed to write violations.jsonl";
      warnings.push(`jsonl: ${artifactStatus.jsonl.error}`);
    }

    // compliance_table.csv
    let csvContent = "";
    try {
      csvContent = toCSV(bundle.rows);
      if (typeof csvContent !== "string") throw new Error("toCSV() must return a string.");
      if (persistenceEnabled) {
        await safeWriteRunFile(runId, "compliance_table.csv", csvContent);
      } else {
        inline.csv = { name: "compliance_table.csv", content: csvContent, bytes: byteLenUtf8(csvContent) };
      }
      artifactStatus.csv.available = true;
      artifactStatus.csv.bytes = byteLenUtf8(csvContent);
      artifactStatus.csv.createdAt = nowIso();
    } catch (e: unknown) {
      artifactStatus.csv.available = false;
      artifactStatus.csv.error = safeString((e as any)?.message) || "Failed to write compliance_table.csv";
      warnings.push(`csv: ${artifactStatus.csv.error}`);
    }

    // report.html (primary artifact)
    let htmlContent = "";
    try {
      htmlContent = toHTML(bundle);
      if (typeof htmlContent !== "string") throw new Error("toHTML() must return a string.");
      if (persistenceEnabled) {
        await safeWriteRunFile(runId, "report.html", htmlContent);
      } else {
        inline.html = { name: "report.html", content: htmlContent, bytes: byteLenUtf8(htmlContent) };
      }
      artifactStatus.html.available = true;
      artifactStatus.html.bytes = byteLenUtf8(htmlContent);
      artifactStatus.html.createdAt = nowIso();
    } catch (e: unknown) {
      artifactStatus.html.available = false;
      artifactStatus.html.error = safeString((e as any)?.message) || "Failed to write report.html";
      warnings.push(`html: ${artifactStatus.html.error}`);
    }

    // report.pdf (best-effort)
    try {
      const pdf = await toPDF(bundle);
      if (!Buffer.isBuffer(pdf)) throw new Error("toPDF() must resolve to a Buffer.");
      if (pdf.length === 0) throw new Error("toPDF() produced an empty Buffer.");

      if (persistenceEnabled) {
        await safeWriteRunFile(runId, "report.pdf", pdf);
      } else {
        inline.pdf = { name: "report.pdf", base64: pdf.toString("base64"), bytes: pdf.length };
      }

      artifactStatus.pdf.available = true;
      artifactStatus.pdf.bytes = pdf.length;
      artifactStatus.pdf.createdAt = nowIso();
    } catch (e: unknown) {
      artifactStatus.pdf.available = false;
      artifactStatus.pdf.error = safeString((e as any)?.message) || "PDF generation failed.";
      warnings.push(`pdf: ${artifactStatus.pdf.error}`);
    }

    // Final meta.json (best-effort; do NOT fail on Vercel)
    const finalMeta: RunMeta = {
      ...baseMeta,
      specId: spec.id,
      selected_model_ids: modelIds,
      concurrency,
      verifierMode,
      auditorModel: verifierMode === "llm_auditor" ? auditorModelId : undefined,
      env: envDiag,
      jobErrors,
      artifacts: {
        html: artifactStatus.html,
        csv: artifactStatus.csv,
        jsonl: artifactStatus.jsonl,
        pdf: artifactStatus.pdf,
      },
      warnings,
    };

    try {
      if (persistenceEnabled) {
        await safeWriteRunFile(runId, "meta.json", JSON.stringify(finalMeta, null, 2));
      }
    } catch (e: unknown) {
      const msg = safeString((e as any)?.message) || "Failed to write meta.json";
      warnings.push(`meta: ${msg}`);
      // Do not throw; Vercel/demo mode can proceed without disk persistence.
    }

    // If HTML failed => still return error (primary artifact)
    if (!artifactStatus.html.available) {
      return NextResponse.json(
        {
          error: "Run completed but failed to generate report.html (primary artifact).",
          runId,
          createdAt,
          specId: spec.id,
          totals,
          warnings,
          debug: { jobErrors: jobErrors.slice(0, 10), artifacts: finalMeta.artifacts },
        },
        { status: 500 }
      );
    }

    // Success response
    const res: any = {
      runId,
      createdAt,
      specId: spec.id,
      totals,
      warnings,
      debug: {
        first_errors: jobErrors.slice(0, 5),
        artifacts: finalMeta.artifacts,
        persistenceEnabled,
      },
    };

    // On Vercel / when persistence disabled, return artifacts inline so users can still download.
    if (!persistenceEnabled) {
      res.artifacts_inline = inline;
      res.notice =
        "Runs persistence is disabled in this environment (e.g. Vercel). Artifacts are returned inline.";
    }

    return NextResponse.json(res);
  } catch (e: unknown) {
    // Fatal fallback (best-effort meta write)
    try {
      const fatalMeta: RunMeta = {
        ...baseMeta,
        fatal: true,
        error: safeString((e as any)?.message) || "Run failed",
        warnings: [],
        artifacts: {
          html: { name: "report.html", available: false, createdAt },
          csv: { name: "compliance_table.csv", available: false, createdAt },
          jsonl: { name: "violations.jsonl", available: false, createdAt },
          pdf: { name: "report.pdf", available: false, createdAt },
        },
      };
      if (isRunsPersistenceEnabled()) {
        await safeWriteRunFile(runId, "meta.json", JSON.stringify(fatalMeta, null, 2));
      }
    } catch {
      // ignore
    }

    return NextResponse.json(
      {
        error: safeString((e as any)?.message) || "Run failed",
        runId,
        details: [
          {
            case_id: "-",
            model: "-",
            stage: "unknown",
            message: safeString((e as any)?.message) || "Run failed",
          },
        ],
      },
      { status: 500 }
    );
  }
}
