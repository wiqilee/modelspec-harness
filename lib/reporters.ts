// lib/reporters.ts
import "server-only";

import Papa from "papaparse";
import type { ComplianceRow, RunBundle } from "./types";

/**
 * Keep CSV consistent with the HTML "Detailed results" table:
 * - Same sorting: case_id asc, then model asc
 * - Same logical columns (plus Status like the table badge)
 * - Stable primitives (no HTML, no locale commas)
 */
export function toCSV(rows: ComplianceRow[]): string {
  const safeNum = (n: unknown, fallback = 0) =>
    typeof n === "number" && Number.isFinite(n) ? n : fallback;

  const safeText = (v: unknown) =>
    String(v ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");

  const sorted = sortDetailedRows(rows ?? []);

  const out = sorted.map((r) => {
    const pass = safeNum((r as any).pass, 0) === 1;
    const cost = safeNum((r as any).cost_usd, 0);

    return {
      case_id: safeText((r as any).case_id),
      model: safeText((r as any).model),
      status: pass ? "PASS" : "FAIL",
      critical: Math.round(safeNum((r as any).critical, 0)),
      high: Math.round(safeNum((r as any).high, 0)),
      medium: Math.round(safeNum((r as any).medium, 0)),
      low: Math.round(safeNum((r as any).low, 0)),
      latency_ms: Math.round(safeNum((r as any).latency_ms, 0)),
      input_tokens: Math.round(safeNum((r as any).input_tokens, 0)),
      output_tokens: Math.round(safeNum((r as any).output_tokens, 0)),
      cost_usd: `$${cost.toFixed(6)}`,
    };
  });

  return Papa.unparse(out, { header: true });
}

/**
 * Timezone behavior:
 * - Default: process.env.REPORT_TIMEZONE || "Asia/Jakarta"
 * - Optional per-run override: (bundle as any).timeZone
 */
function resolveReportTimeZone(bundle?: unknown): string {
  const tzFromBundle =
    bundle && typeof bundle === "object" && bundle !== null ? (bundle as any).timeZone : undefined;

  const tz =
    (typeof tzFromBundle === "string" && tzFromBundle.trim() ? tzFromBundle.trim() : null) ??
    (typeof process.env.REPORT_TIMEZONE === "string" && process.env.REPORT_TIMEZONE.trim()
      ? process.env.REPORT_TIMEZONE.trim()
      : null) ??
    "Asia/Jakarta";

  return tz;
}

function formatCreatedAt(
  createdAt: unknown,
  timeZone: string
): { dateLabel: string; timeLabel: string; timeZoneLabel: string; raw: string } {
  const raw = String(createdAt ?? "");
  const d = new Date(raw);
  const valid = Number.isFinite(d.getTime());

  const timeZoneLabel = timeZone;

  if (!valid) return { dateLabel: raw, timeLabel: raw, timeZoneLabel, raw };

  const dateLabel = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);

  const timeLabel = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);

  return { dateLabel, timeLabel, timeZoneLabel, raw };
}

/**
 * Single source of truth for the HTML "Detailed results" ordering.
 * (Used by HTML and PDF so they stay consistent.)
 */
function sortDetailedRows(rows: ComplianceRow[]): ComplianceRow[] {
  return (rows ?? [])
    .slice()
    .sort((a, b) =>
      String((a as any).case_id) === String((b as any).case_id)
        ? String((a as any).model).localeCompare(String((b as any).model))
        : String((a as any).case_id).localeCompare(String((b as any).case_id))
    );
}

export function toHTML(bundle: RunBundle): string {
  const { runId, specId, createdAt, rows, totals } = bundle;

  const timeZone = resolveReportTimeZone(bundle);
  const { dateLabel, timeLabel, timeZoneLabel } = formatCreatedAt(createdAt, timeZone);

  const escape = (s: unknown) => {
    const t = String(s ?? "");
    return t
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  };

  const safeNum = (n: unknown, fallback = 0) =>
    typeof n === "number" && Number.isFinite(n) ? n : fallback;

  const fmtInt = (n: unknown) => Math.round(safeNum(n, 0)).toLocaleString("en-US");
  const fmtUsd = (n: unknown, digits = 6) => `$${safeNum(n, 0).toFixed(digits)}`;
  const fmtMs = (n: unknown) => `${fmtInt(n)} ms`;

  const totalCases = safeNum((totals as any)?.totalCases, 0);
  const totalRuns = safeNum((totals as any)?.totalRows, 0);

  const byModel = (totals?.byModel ?? []) as Array<any>;
  const overallPass = byModel.reduce((acc, m) => acc + safeNum(m.pass, 0), 0);
  const overallTotal = byModel.reduce((acc, m) => acc + safeNum(m.total, 0), 0);
  const overallPassRate = overallTotal > 0 ? Math.round((overallPass / overallTotal) * 100) : 0;

  const scoredModels = (() => {
    const scored = byModel.map((m) => {
      const total = safeNum(m.total, 0);
      const pass = safeNum(m.pass, 0);
      const passRate = total > 0 ? pass / total : 0;
      const avgLatency = safeNum(m.avg_latency_ms, 0);
      const cost = safeNum(m.cost_usd, 0);
      return { model: String(m.model ?? ""), total, pass, passRate, avgLatency, cost };
    });

    const best =
      scored
        .slice()
        .sort(
          (a, b) =>
            b.passRate - a.passRate || a.avgLatency - b.avgLatency || a.model.localeCompare(b.model)
        )[0] ?? null;

    const worst =
      scored
        .slice()
        .sort(
          (a, b) =>
            a.passRate - b.passRate || b.avgLatency - a.avgLatency || a.model.localeCompare(b.model)
        )[0] ?? null;

    const fastest =
      scored
        .slice()
        .sort(
          (a, b) =>
            a.avgLatency - b.avgLatency || b.passRate - a.passRate || a.model.localeCompare(b.model)
        )[0] ?? null;

    const cheapest =
      scored
        .slice()
        .sort(
          (a, b) => a.cost - b.cost || b.passRate - a.passRate || a.model.localeCompare(b.model)
        )[0] ?? null;

    return { best, worst, fastest, cheapest, all: scored };
  })();

  const bestModel = scoredModels.best;
  const worstModel = scoredModels.worst;
  const fastestModel = scoredModels.fastest;
  const cheapestModel = scoredModels.cheapest;

  const costTotal = byModel.reduce((acc, m) => acc + safeNum(m.cost_usd, 0), 0);

  const latencyAvgAll = (() => {
    const total = byModel.reduce((acc, m) => acc + safeNum(m.total, 0), 0);
    if (total <= 0) return 0;
    const sum = byModel.reduce((acc, m) => {
      const t = safeNum(m.total, 0);
      const avg = safeNum(m.avg_latency_ms, 0);
      return acc + t * avg;
    }, 0);
    return sum / total;
  })();

  const topIssues = (() => {
    const list = (rows ?? []).slice().map((r) => ({
      case_id: String((r as any).case_id ?? ""),
      model: String((r as any).model ?? ""),
      pass: safeNum((r as any).pass, 0) === 1,
      critical: safeNum((r as any).critical, 0),
      high: safeNum((r as any).high, 0),
      medium: safeNum((r as any).medium, 0),
      low: safeNum((r as any).low, 0),
      latency_ms: safeNum((r as any).latency_ms, 0),
      cost_usd: safeNum((r as any).cost_usd, 0),
    }));

    list.sort((a, b) => {
      if (b.critical !== a.critical) return b.critical - a.critical;
      if (b.high !== a.high) return b.high - a.high;
      if (b.medium !== a.medium) return b.medium - a.medium;
      if (b.low !== a.low) return b.low - a.low;
      return b.latency_ms - a.latency_ms;
    });

    return list.slice(0, 5);
  })();

  const modelCards = byModel
    .map((m) => {
      const model = String(m.model ?? "");
      const total = safeNum(m.total, 0);
      const pass = safeNum(m.pass, 0);
      const passRate = total > 0 ? Math.round((pass / total) * 100) : 0;
      const avgLatency = safeNum(m.avg_latency_ms, 0);
      const cost = safeNum(m.cost_usd, 0);

      const badge =
        passRate >= 80 ? "good" : passRate >= 50 ? "warn" : passRate > 0 ? "bad" : "neutral";

      return `
        <div class="card model hoverable">
          <div class="kicker">${escape(model)}</div>
          <div class="row">
            <div class="big">${passRate}%</div>
            <span class="pill ${badge}">${pass}/${total} passed</span>
          </div>
          <div class="muted">⏱️ Average latency: <b>${escape(fmtMs(avgLatency))}</b></div>
          <div class="muted">💸 Estimated cost: <b>${escape(fmtUsd(cost, 4))}</b></div>
        </div>
      `;
    })
    .join("");

  const detailedRowsSorted = sortDetailedRows(rows ?? []);

  const tableRows = detailedRowsSorted
    .map((r) => {
      const pass = safeNum((r as any).pass, 0) === 1;
      const badge = pass
        ? `<span class="badge ok">PASS</span>`
        : `<span class="badge bad">FAIL</span>`;

      return `
        <tr>
          <td class="mono">${escape((r as any).case_id)}</td>
          <td class="mono">${escape((r as any).model)}</td>
          <td>${badge}</td>
          <td class="num">${fmtInt((r as any).critical)}</td>
          <td class="num">${fmtInt((r as any).high)}</td>
          <td class="num">${fmtInt((r as any).medium)}</td>
          <td class="num">${fmtInt((r as any).low)}</td>
          <td class="num">${fmtInt((r as any).latency_ms)}</td>
          <td class="num">${fmtInt((r as any).input_tokens)}</td>
          <td class="num">${fmtInt((r as any).output_tokens)}</td>
          <td class="num">${escape(fmtUsd((r as any).cost_usd, 6))}</td>
        </tr>
      `;
    })
    .join("");

  const insightsHtml = (() => {
    const fmtModelLine = (m: any | null, labelHtml: string) => {
      if (!m) return `<li>${labelHtml}: —</li>`;
      return `<li>${labelHtml}: ${escape(m.model)} (${Math.round(m.passRate * 100)}% pass, ${escape(
        fmtMs(m.avgLatency)
      )} avg latency, ${escape(fmtUsd(m.cost, 6))})</li>`;
    };

    const topIssueItems =
      topIssues.length > 0
        ? topIssues
            .map((x) => {
              const sev =
                x.critical > 0
                  ? "Critical"
                  : x.high > 0
                    ? "High"
                    : x.medium > 0
                      ? "Medium"
                      : x.low > 0
                        ? "Low"
                        : "None";

              const counts = `C:${x.critical} H:${x.high} M:${x.medium} L:${x.low}`;

              return `<li><span class="mono">${escape(x.case_id)}</span> · <span class="mono">${escape(
                x.model
              )}</span> — <b>${escape(sev)}</b> (${escape(counts)}), ${escape(
                fmtMs(x.latency_ms)
              )}, ${escape(fmtUsd(x.cost_usd, 6))}</li>`;
            })
            .join("")
        : `<li>No rows were produced.</li>`;

    const conclusion = (() => {
      const parts: string[] = [];
      parts.push(fmtModelLine(bestModel, "<b>Best reliability</b>"));
      parts.push(fmtModelLine(worstModel, "<b>Lowest reliability</b>"));
      if (fastestModel) parts.push(fmtModelLine(fastestModel, "<b>Fastest average latency</b>"));
      if (cheapestModel) parts.push(fmtModelLine(cheapestModel, "<b>Lowest estimated cost</b>"));
      parts.push(
        `<li><b>Recommendation</b>: Use the highest-pass-rate model for compliance baselines, and validate faster or cheaper options against <b>Critical</b> rules before production.</li>`
      );
      return `<ul class="ulist">${parts.join("")}</ul>`;
    })();

    return `
      <div class="card hoverable" style="margin:14px 0;">
        <div class="sectionTitle">✨ Plain-English insights</div>
        <div class="note">
          This report evaluates model outputs against the selected spec and test cases. Use it to compare reliability,
          identify high-severity issues, and understand speed and cost trade-offs.
        </div>

        <div class="bullets">
          <div class="bullet">
            <div class="dot"></div>
            <div><b>Overall pass rate</b> is <b>${overallPassRate}%</b> (${overallPass}/${overallTotal}). Higher is better.</div>
          </div>
          <div class="bullet">
            <div class="dot"></div>
            <div><b>Latency</b> is response time. Lower is better for interactive products.</div>
          </div>
          <div class="bullet">
            <div class="dot"></div>
            <div>
              <b>Cost</b> is an estimate based on token usage and your rate card. Use it for relative comparisons, not billing.
              If a model has no matching rate entry, its cost is shown as $0.0000.
            </div>
          </div>
        </div>

        <div class="subgrid">
          <div class="mini hoverable">
            <div class="miniK">Avg latency (all runs)</div>
            <div class="miniV">⏱️ ${escape(fmtMs(latencyAvgAll))}</div>
          </div>
          <div class="mini hoverable">
            <div class="miniK">Total estimated cost</div>
            <div class="miniV">💸 ${escape(fmtUsd(costTotal, 6))}</div>
          </div>
          <div class="mini hoverable">
            <div class="miniK">Severity meaning</div>
            <div class="miniV">Critical typically fails the run; others are recorded for review.</div>
          </div>
        </div>

        <div class="hr"></div>

        <div class="sectionTitle" style="margin-top:10px;">📌 Conclusion</div>
        <div class="note">${conclusion}</div>

        <div class="hr"></div>

        <div class="sectionTitle" style="margin-top:10px;">🚨 Top problem rows (quick scan)</div>
        <ol class="olist">
          ${topIssueItems}
        </ol>
      </div>
    `;
  })();

  const ico = {
    back: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10.5 19a1 1 0 0 1-.71-.29l-6-6a1 1 0 0 1 0-1.42l6-6a1 1 0 1 1 1.42 1.42L6.91 11H20a1 1 0 1 1 0 2H6.91l4.3 4.29A1 1 0 0 1 10.5 19Z"/></svg>`,
    pdf: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 2H7a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8Zm0 2.5L18.5 9H14ZM7 20a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5v5a2 2 0 0 0 2 2h5v8a1 1 0 0 1-1 1Zm2.5-6.5h1.2c1.3 0 2.3-.8 2.3-2.2S12 9.1 10.7 9.1H8.1V17h1.4Zm0-3h1c.5 0 .9.3.9.8s-.4.8-.9.8h-1ZM14.2 9.1h-2V17h2c2 0 3.3-1.5 3.3-3.9s-1.3-4-3.3-4Zm-.6 1.4h.6c1.1 0 1.9.9 1.9 2.6S15.3 15.6 14.2 15.6h-.6Z"/></svg>`,
    csv: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 2H7a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8Zm0 2.5L18.5 9H14ZM7 20a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5v5a2 2 0 0 0 2 2h5v8a1 1 0 0 1-1 1Zm2.2-4.4c-.9 0-1.6-.8-1.6-2s.7-2 1.6-2c.4 0 .7.1 1 .3l.5-1.1c-.4-.2-1-.4-1.6-.4-1.7 0-3 1.3-3 3.2s1.2 3.2 3 3.2c.6 0 1.2-.1 1.7-.4l-.5-1.1c-.3.2-.7.3-1.1.3Zm3.9 1.2c-1 0-1.8-.3-2.3-.6l.5-1.1c.5.3 1.1.5 1.8.5s1-.2 1-.5c0-.9-3.1-.3-3.1-2.3 0-.9.8-1.7 2.6-1.7.8 0 1.5.2 2.1.5l-.5 1.1c-.5-.3-1.1-.4-1.6-.4-.6 0-.9.2-.9.5 0 .8 3.1.2 3.1 2.3 0 1.1-1.1 1.7-2.7 1.7Zm4.6-.1h-1.5l-2.1-6.3h1.5l1.3 4.3 1.3-4.3H20Z"/></svg>`,
    jsonl: `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M14 2H7a3 3 0 0 0-3 3v14a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3V8Zm0 2.5L18.5 9H14ZM7 20a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h5v5a2 2 0 0 0 2 2h5v8a1 1 0 0 1-1 1Zm2.7-3.6v-1.2c-.8-.1-1.2-.7-1.2-1.6s.4-1.5 1.2-1.6v-1.2c-1.5.1-2.6 1.2-2.6 2.8s1.1 2.7 2.6 2.8Zm3.2 0c1.5-.1 2.6-1.2 2.6-2.8s-1.1-2.7-2.6-2.8V12c.8.1 1.2.7 1.2 1.6s-.4 1.5-1.2 1.6Zm3.6-.2h-1.4v-5.8h1.4Z"/></svg>`,
  };

  // ✅ CHANGED: Wiqi Lee uses brandNameGradient class (matches your UI footer vibe)
  const footerHtml = `
    <footer style="margin-top:18px;">
      <div class="footerCard hoverable">
        <div class="footerGlow" aria-hidden="true"></div>

        <div class="footerInner">
          <div class="footerLeft">
            <div class="logoMark" aria-hidden="true">
              <div class="logoBox"></div>
              <div class="logoPulse"></div>
              <svg width="22" height="22" viewBox="0 0 24 24" class="logoSvg">
                <path
                  fill="currentColor"
                  d="M12 2c-2.7 0-5 1-6.9 2.9S2.2 9.2 2.2 12s1 5 2.9 6.9S9.3 21.8 12 21.8s5-1 6.9-2.9 2.9-4.2 2.9-6.9-1-5-2.9-6.9S14.7 2 12 2Zm0 2.2c2.1 0 3.9.7 5.4 2.2S19.6 9.9 19.6 12s-.7 3.9-2.2 5.4S14.1 19.6 12 19.6s-3.9-.7-5.4-2.2S4.4 14.1 4.4 12s.7-3.9 2.2-5.4S9.9 4.4 12 4.4Zm-1.1 3.1v9.4l7-4.7-7-4.7Z"
                />
              </svg>
            </div>

            <div>
              <div class="footerTitle">ModelSpec Harness</div>
              <div class="footerSub">
                ✍️ Built by <span class="brandNameGradient">Wiqi Lee</span> · Provider routing via OpenAI and Groq.
              </div>
              <div class="footerSub">
                ⚠️ Not affiliated with or endorsed by any provider.
              </div>
              <div class="footerSub">
                <b>💡 Tip:</b> Configure <span class="mono">OPENAI_API_KEY</span> and/or <span class="mono">GROQ_API_KEY</span> in your environment.
              </div>
            </div>
          </div>

          <a
            class="footerBtn"
            href="https://x.com/wiqi_lee"
            target="_blank"
            rel="noreferrer"
            title="Open @wiqi_lee"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" class="xIco" aria-hidden="true">
              <path
                fill="currentColor"
                d="M18.9 2H22l-6.7 7.7L23 22h-6.6l-5.1-6.7L5.7 22H2.6l7.2-8.3L1.5 2H8.3l4.6 6.1L18.9 2Zm-1.2 18h1.8L7.3 3.9H5.4L17.7 20Z"
              />
            </svg>
            <span>@wiqi_lee</span>
          </a>
        </div>

        <div class="footerDivider">
          <div class="footerShimmer" aria-hidden="true"></div>
        </div>

        <div class="footerBottom">
          ✅ Generated locally · Reproducible artifacts · Audit-ready and shareable
        </div>
      </div>
    </footer>
  `;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>ModelSpec Harness Report — ${escape(runId)}</title>
<style>
  :root{
    --bg:#ffffff; --fg:#0b1220; --muted:#5b677a; --line:#e6eaf2; --card:#ffffff;
    --shadow:0 16px 40px rgba(2,6,23,.08); --radius:18px;

    --ok:#16a34a; --ok-bg:#ecfdf5; --ok-br:#bbf7d0;
    --bad:#e11d48; --bad-bg:#fff1f2; --bad-br:#fecdd3;
    --warn:#d97706; --warn-bg:#fffbeb; --warn-br:#fde68a;
    --neutral:#64748b; --neutral-bg:#f8fafc; --neutral-br:#e2e8f0;

    --brand:#4f46e5; --brand-2:#4338ca;

    /* DOWNLOAD BUTTONS -> ORANGE */
    --dl:#f97316;
    --dl-2:#ea580c;

    --link:#4f46e5;
  }
  *{box-sizing:border-box}
  body{
    margin:0;
    font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, "Apple Color Emoji","Segoe UI Emoji";
    background: radial-gradient(900px 480px at 20% 0%, #f3f6ff 0%, rgba(243,246,255,0) 60%),
                radial-gradient(900px 480px at 100% 20%, #f0fff7 0%, rgba(240,255,247,0) 55%),
                var(--bg);
    color:var(--fg);
  }
  .wrap{max-width:1140px;margin:0 auto;padding:36px 18px 52px;}

  /* Premium animated header */
  @keyframes headerFloat {
    0%   { transform: translateY(0); }
    50%  { transform: translateY(-2px); }
    100% { transform: translateY(0); }
  }
  @keyframes headerSheen {
    0%   { transform: translateX(-60%) rotate(12deg); opacity:0; }
    10%  { opacity: .55; }
    55%  { opacity: .55; }
    100% { transform: translateX(140%) rotate(12deg); opacity:0; }
  }
  @keyframes headerGlow {
    0%   { box-shadow: 0 16px 40px rgba(2,6,23,.08); }
    50%  { box-shadow: 0 26px 68px rgba(79,70,229,.18); }
    100% { box-shadow: 0 16px 40px rgba(2,6,23,.08); }
  }
  .top{
    position:relative;
    overflow:hidden;
    display:flex;justify-content:space-between;gap:18px;align-items:flex-start;
    border:1px solid rgba(79,70,229,.22);
    border-radius: 22px;
    padding:18px 18px 16px;
    background:
      radial-gradient(700px 240px at 12% 0%, rgba(79,70,229,.14) 0%, rgba(79,70,229,0) 55%),
      radial-gradient(700px 240px at 100% 20%, rgba(22,163,74,.10) 0%, rgba(22,163,74,0) 55%),
      linear-gradient(180deg, rgba(255,255,255,1) 0%, rgba(249,250,255,.92) 100%);
    box-shadow: var(--shadow);
    animation: headerGlow 6.2s ease-in-out infinite, headerFloat 6.8s ease-in-out infinite;
  }
  .top:before{
    content:"";
    position:absolute;
    inset:-2px;
    border-radius: 24px;
    background:
      linear-gradient(90deg,
        rgba(79,70,229,0) 0%,
        rgba(79,70,229,.12) 25%,
        rgba(249,115,22,.10) 60%,
        rgba(79,70,229,0) 100%);
    filter: blur(18px);
    opacity:.55;
    pointer-events:none;
  }
  .top:after{
    content:"";
    position:absolute;
    top:-60%;
    left:-40%;
    width:52%;
    height:220%;
    background: linear-gradient(90deg, transparent, rgba(255,255,255,.72), transparent);
    transform: rotate(12deg);
    opacity:0;
    animation: headerSheen 4.6s ease-in-out infinite;
    pointer-events:none;
  }
  @media (prefers-reduced-motion: reduce){
    .top{ animation: none; }
    .top:after{ animation:none; display:none; }
  }

  .brandMark{display:inline-flex;align-items:center;gap:10px;margin-bottom:10px;}
  .brandIcon{
    width:40px;height:40px;border-radius:14px;
    border:1px solid rgba(2,6,23,.10);
    background: linear-gradient(180deg, #fff 0%, #f6f7ff 100%);
    box-shadow: 0 12px 26px rgba(2,6,23,.08);
    display:grid; place-items:center;
    position:relative; overflow:hidden;
  }
  .brandIcon:before{
    content:"";
    position:absolute; inset:-30%;
    background: radial-gradient(circle at 30% 30%, rgba(79,70,229,.22), transparent 60%);
    transform: rotate(18deg);
  }
  .brandIcon svg{position:relative;width:22px;height:22px;color: rgba(2,6,23,.80);}
  .brandTag{font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase;color: rgba(2,6,23,.55);}

  .title{
    font-size:32px;font-weight:900;letter-spacing:-.03em;line-height:1.08;margin:0;
    background: linear-gradient(90deg, #0b1220 0%, #111c33 40%, rgba(79,70,229,.95) 100%);
    -webkit-background-clip:text;background-clip:text;color:transparent;
  }
  .meta{margin-top:10px;color:var(--muted);font-size:13px;line-height:1.6}
  .meta b{color:var(--fg);font-weight:800}

  .headerRight{display:flex;flex-direction:column;align-items:flex-end;gap:10px;min-width:220px;}
  .chipRow{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
  .chip{
    display:inline-flex;align-items:center;gap:8px;
    padding:6px 10px;border-radius:999px;
    border:1px solid rgba(2,6,23,.10);
    background: rgba(255,255,255,.72);
    backdrop-filter: blur(6px);
    color: rgba(2,6,23,.75);
    font-size:12px;font-weight:900;
    box-shadow: 0 10px 22px rgba(2,6,23,.06);
  }
  .chipDot{width:8px;height:8px;border-radius:999px;background: rgba(79,70,229,.55)}

  .actions{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin:16px 0 18px;}
  .btnrow{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}
  a.btn{
    display:inline-flex;align-items:center;gap:8px;
    padding:9px 12px;border-radius:999px;
    border:1px solid var(--line); background:#fff;
    color:var(--fg); text-decoration:none; font-size:13px; font-weight:800;
    box-shadow:0 10px 24px rgba(2,6,23,.06);
    transition:transform .14s ease, box-shadow .14s ease, background-color .14s ease, border-color .14s ease, color .14s ease;
    white-space:nowrap; user-select:none;
  }
  a.btn:hover{transform:translateY(-1px); box-shadow:0 16px 34px rgba(2,6,23,.10);}
  a.btn:active{transform:translateY(0px) scale(.99); box-shadow:0 10px 22px rgba(2,6,23,.08);}
  a.btn:focus{outline:none}
  a.btn:focus-visible{box-shadow:0 0 0 4px rgba(79,70,229,.18), 0 16px 34px rgba(2,6,23,.10);}

  a.btn.back{
    background: linear-gradient(180deg, rgba(79,70,229,1) 0%, rgba(67,56,202,1) 100%);
    border-color: rgba(79,70,229,.35);
    color:#fff;
  }
  a.btn.back:hover{
    background: linear-gradient(180deg, rgba(79,70,229,1) 0%, rgba(56,48,170,1) 100%);
    border-color: rgba(79,70,229,.45);
  }

  a.btn.dl{
    background: linear-gradient(180deg, var(--dl) 0%, var(--dl-2) 100%);
    border-color: rgba(249,115,22,.45);
    color:#fff;
  }
  a.btn.dl:hover{
    background: linear-gradient(180deg, var(--dl) 0%, #c2410c 100%);
    border-color: rgba(249,115,22,.60);
  }

  .ico{width:16px;height:16px;display:inline-block;vertical-align:-3px;opacity:.95}
  a.link{color:var(--link); text-decoration:underline; text-underline-offset:3px; text-decoration-color:rgba(79,70,229,.25);}
  .dlmeta{display:flex;flex-wrap:wrap;gap:10px;align-items:center;color:var(--muted);font-size:13px;}

  .grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:16px 0 18px;}
  .card{border:1px solid var(--line);border-radius:var(--radius);background:var(--card);box-shadow:var(--shadow);padding:16px;}

  .hoverable{transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease; will-change: transform;}
  .hoverable:hover{transform: translateY(-3px);box-shadow: 0 22px 52px rgba(2,6,23,.12);border-color: rgba(79,70,229,.22);}

  .card.model{padding:16px}
  .kicker{color:var(--muted); font-size:12px; text-transform:uppercase; letter-spacing:.08em; font-weight:800; margin-bottom:6px;}
  .row{display:flex;align-items:baseline;gap:10px;justify-content:space-between}
  .big{font-size:36px;font-weight:850;letter-spacing:-.02em}

  .pill{font-size:12px;font-weight:900;padding:4px 10px;border-radius:999px;border:1px solid var(--line);background:#fff;color:var(--fg);}
  .pill.good{color:var(--ok); background:var(--ok-bg); border-color:var(--ok-br);}
  .pill.bad{color:var(--bad); background:var(--bad-bg); border-color:var(--bad-br);}
  .pill.warn{color:var(--warn); background:var(--warn-bg); border-color:var(--warn-br);}
  .pill.neutral{color:var(--neutral); background:var(--neutral-bg); border-color:var(--neutral-br);}

  .muted{color:var(--muted);font-size:13px;line-height:1.55}
  .muted b{color:var(--fg);font-weight:750}
  .sectionTitle{font-weight:900;letter-spacing:-.01em;font-size:14px;margin-bottom:6px;}
  .note{color:var(--muted);font-size:13px;line-height:1.65;}
  .bullets{display:flex;flex-direction:column;gap:10px;margin-top:12px}
  .bullet{display:flex;gap:10px;align-items:flex-start}
  .dot{width:8px;height:8px;border-radius:999px;background:#94a3b8;margin-top:6px;flex:0 0 auto}
  .hr{height:1px;background:var(--line);margin:14px 0}

  .subgrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}
  .mini{border:1px solid var(--line);border-radius:14px;padding:12px;background: linear-gradient(180deg, #ffffff 0%, #fbfcff 100%);}
  .miniK{color:var(--muted);font-size:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
  .miniV{font-size:14px;font-weight:900;margin-top:6px}

  .ulist{margin:10px 0 0 18px; padding:0; color:var(--muted); font-size:13px; line-height:1.6}
  .ulist li{margin:6px 0}
  .ulist b{color:var(--fg)}

  table{
    width:100%;
    border-collapse:separate;
    border-spacing:0;
    overflow:hidden;
    border:1px solid var(--line);
    border-radius:var(--radius);
    box-shadow:var(--shadow);
    background:#fff;
  }
  thead th{
    background:#f8fafc;color:#0f172a;text-align:left;font-weight:900;font-size:12px;letter-spacing:.02em;
    padding:10px 10px;border-bottom:1px solid var(--line);position:sticky; top:0;
  }
  tbody td{padding:10px 10px;border-bottom:1px solid var(--line);font-size:13px;vertical-align:middle;}
  tbody tr:nth-child(2n){background:#fcfdff}
  tbody tr:hover{background:#f6f9ff}
  tbody tr:last-child td{border-bottom:none;}

  .badge{
    display:inline-flex;align-items:center;justify-content:center;
    padding:4px 10px;border-radius:999px;font-size:12px;font-weight:900;border:1px solid var(--line);
    letter-spacing:.02em;
  }
  .ok{color:var(--ok); background:var(--ok-bg); border-color:var(--ok-br);}
  .bad{color:var(--bad); background:var(--bad-bg); border-color:var(--bad-br);}

  .mono{font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;font-size:12.5px;}
  .num{text-align:right;font-variant-numeric: tabular-nums;}

  .olist{margin:10px 0 0 18px; padding:0; color:var(--muted); font-size:13px; line-height:1.6}
  .olist li{margin:6px 0}
  .olist b{color:var(--fg)}

  /* ✅ NEW: Brand gradient for "Wiqi Lee" like your UI footer */
  @keyframes brandShift {
    0% { background-position: 0% 50%; }
    50% { background-position: 100% 50%; }
    100% { background-position: 0% 50%; }
  }
  .brandNameGradient{
    font-weight: 900;
    background: linear-gradient(90deg,
      rgba(124, 58, 237, 0.95) 0%,
      rgba(249, 115, 22, 0.70) 55%,
      rgba(124, 58, 237, 0.95) 100%
    );
    background-size: 220% 220%;
    animation: brandShift 6.8s ease-in-out infinite;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    text-shadow: 0 0 18px rgba(124, 58, 237, 0.10);
  }
  @media (prefers-reduced-motion: reduce){
    .brandNameGradient{ animation:none; }
  }

  /* Footer styles */
  @keyframes footerGlow {
    0% { opacity:.35; transform: translateY(0) scale(1); }
    50% { opacity:.55; transform: translateY(-2px) scale(1.02); }
    100% { opacity:.35; transform: translateY(0) scale(1); }
  }
  @keyframes footerShimmer {
    0% { transform: translateX(-40%); opacity: 0; }
    15% { opacity: 1; }
    60% { opacity: 1; }
    100% { transform: translateX(140%); opacity: 0; }
  }
  .footerCard{
    position:relative;overflow:hidden;
    border-radius: 22px;
    border:1px solid rgba(2,6,23,.10);
    background:#fff;
    box-shadow: var(--shadow);
    padding:16px;
  }
  .footerGlow{pointer-events:none;position:absolute; inset:0;opacity:.40;}
  .footerGlow:before{
    content:"";
    position:absolute;left:-96px; top:-96px;width:300px; height:300px;border-radius:999px;
    background: rgba(2,6,23,.045);filter: blur(32px);
    animation: footerGlow 5.5s ease-in-out infinite;
  }
  .footerGlow:after{
    content:"";
    position:absolute;right:-110px; bottom:-110px;width:340px; height:340px;border-radius:999px;
    background: rgba(2,6,23,.035);filter: blur(34px);
    animation: footerGlow 6.2s ease-in-out infinite;
  }
  .footerInner{
    position:relative;
    display:flex;gap:14px;align-items:center;justify-content:space-between;flex-wrap:wrap;
  }
  .footerLeft{display:flex;gap:12px;align-items:flex-start;min-width:260px;}
  .footerTitle{font-size:14px;font-weight:900;color:#0b1220}
  .footerSub{font-size:12px;color:var(--muted);line-height:1.55;margin-top:2px}
  .footerBtn{
    display:inline-flex; align-items:center; gap:8px;
    padding:9px 12px;border-radius:999px;border:1px solid var(--line);
    background:#fff;color:#0b1220;text-decoration:none;font-size:13px;font-weight:800;
    box-shadow:0 10px 24px rgba(2,6,23,.06);
    transition:transform .14s ease, box-shadow .14s ease, border-color .14s ease, background-color .14s ease;
    white-space:nowrap;
  }
  .footerBtn:hover{transform: translateY(-1px); box-shadow:0 16px 34px rgba(2,6,23,.10); border-color: rgba(79,70,229,.22);}
  .xIco{color: rgba(2,6,23,.70)}
  .footerDivider{
    position:relative;margin-top:12px;height:1px;width:100%;overflow:hidden;
    background: linear-gradient(90deg, transparent, rgba(2,6,23,.10), transparent);
  }
  .footerShimmer{
    position:absolute; top:0;height:1px;width:33%;
    background: linear-gradient(90deg, transparent, rgba(2,6,23,.25), transparent);
    animation: footerShimmer 2.8s ease-in-out infinite;
  }
  .footerBottom{position:relative;margin-top:10px;text-align:center;font-size:12px;color: var(--muted);}
  .logoMark{
    position:relative;width:44px;height:44px;display:inline-flex;align-items:center;justify-content:center;flex:0 0 auto;
  }
  .logoBox{
    position:absolute; inset:0;border-radius:16px;border:1px solid rgba(2,6,23,.10);
    background:#fff;box-shadow:0 8px 18px rgba(2,6,23,.06);
  }
  .logoPulse{
    position:absolute; inset:0;border-radius:16px;
    background: linear-gradient(135deg, rgba(2,6,23,.08), transparent);
    opacity:.45;
  }
  .logoSvg{position:relative;color: rgba(2,6,23,.80);}

  @media (max-width: 980px){
    .grid{grid-template-columns:1fr}
    .subgrid{grid-template-columns:1fr}
    .top{flex-direction:column}
    .headerRight{align-items:flex-start}
    thead th{position:static}
  }
</style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="brandMark">
          <div class="brandIcon" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path fill="currentColor" d="M12 2c-2.7 0-5 1-6.9 2.9S2.2 9.2 2.2 12s1 5 2.9 6.9S9.3 21.8 12 21.8s5-1 6.9-2.9 2.9-4.2 2.9-6.9-1-5-2.9-6.9S14.7 2 12 2Zm0 2.2c2.1 0 3.9.7 5.4 2.2S19.6 9.9 19.6 12s-.7 3.9-2.2 5.4S14.1 19.6 12 19.6s-3.9-.7-5.4-2.2S4.4 14.1 4.4 12s.7-3.9 2.2-5.4S9.9 4.4 12 4.4Zm-1.1 3.1v9.4l7-4.7-7-4.7Z"/>
            </svg>
          </div>
          <div class="brandTag">ModelSpec Harness</div>
        </div>

        <div class="title">ModelSpec Harness Report</div>
        <div class="meta">
          <div>Run: <b>${escape(runId)}</b></div>
          <div>Spec: <b>${escape(specId)}</b></div>
          <div>Date: <b>${escape(dateLabel)}</b></div>
          <div>Time (${escape(timeZoneLabel)}): <b>${escape(timeLabel)}</b></div>
        </div>
      </div>

      <div class="headerRight">
        <div class="chipRow">
          <div class="chip"><span class="chipDot"></span><span>Audit-ready</span></div>
          <div class="chip"><span class="chipDot" style="background:rgba(249,115,22,.55)"></span><span>Shareable</span></div>
        </div>
        <div class="chipRow">
          <div class="chip"><span class="chipDot" style="background:rgba(22,163,74,.55)"></span><span>Local artifacts</span></div>
        </div>
      </div>
    </div>

    <div class="actions">
      <div class="btnrow">
        <a class="btn back" href="/" title="Back to the harness UI">${ico.back} Back</a>
        <a class="btn dl" href="report.pdf" title="Download PDF (if available)">${ico.pdf} PDF</a>
        <a class="btn dl" href="compliance_table.csv" title="Download CSV">${ico.csv} CSV</a>
        <a class="btn dl" href="violations.jsonl" title="Download JSONL">${ico.jsonl} JSONL</a>
      </div>
      <div class="dlmeta">
        <span>📎 More:</span>
        <a class="link" href="meta.json">meta.json</a>
      </div>
    </div>

    ${insightsHtml}

    <div class="card hoverable" style="margin:14px 0;">
      <div class="sectionTitle">🧭 How to read this report (quick guide)</div>
      <div class="note">
        <div class="bullets">
          <div class="bullet"><div class="dot"></div><div><b>Pass rate</b> is the percentage of cases that meet the spec for a given model. Higher is better.</div></div>
          <div class="bullet"><div class="dot"></div><div><b>Severity</b>: <b>Critical</b> typically fails a case; <b>High/Medium/Low</b> issues are recorded and may still be acceptable depending on your policy.</div></div>
          <div class="bullet"><div class="dot"></div><div><b>Latency</b> is response time. Lower latency matters for interactive experiences.</div></div>
          <div class="bullet"><div class="dot"></div><div><b>Cost</b> is an estimate based on token usage and your configured rate card. Use it for relative comparisons, not billing. If a model has no matching rate entry, its cost is shown as $0.0000.</div></div>
          <div class="bullet"><div class="dot"></div><div>For more detail, open <span class="mono">violations.jsonl</span> for per-run evidence and explanations.</div></div>
        </div>
      </div>
    </div>

    <div class="grid">
      <div class="card hoverable">
        <div class="kicker">Overall</div>
        <div class="row">
          <div class="big">${overallPassRate}%</div>
          <span class="pill ${
            overallPassRate >= 80
              ? "good"
              : overallPassRate >= 50
                ? "warn"
                : overallPassRate > 0
                  ? "bad"
                  : "neutral"
          }">${overallPass}/${overallTotal} passed</span>
        </div>
        <div class="muted">🧪 Total cases: <b>${fmtInt(totalCases)}</b></div>
        <div class="muted">🧰 Total model-runs: <b>${fmtInt(totalRuns)}</b></div>
      </div>

      <div class="card hoverable">
        <div class="kicker">Best model</div>
        <div class="big" style="font-size:18px;font-weight:900;margin-top:2px;line-height:1.2">
          ${escape(bestModel?.model ?? "—")}
        </div>
        <div class="muted" style="margin-top:8px">
          Pass rate: <b>${escape(bestModel ? String(Math.round(bestModel.passRate * 100)) + "%" : "—")}</b>
          · Avg latency: <b>${escape(bestModel ? fmtMs(bestModel.avgLatency) : "—")}</b>
        </div>
        <div class="muted">Est. cost: <b>${escape(bestModel ? fmtUsd(bestModel.cost, 4) : "—")}</b></div>
      </div>

      <div class="card hoverable">
        <div class="kicker">Totals</div>
        <div class="muted">⏱️ Avg latency (all runs): <b>${escape(fmtMs(latencyAvgAll))}</b></div>
        <div class="muted">💸 Total estimated cost: <b>${escape(fmtUsd(costTotal, 6))}</b></div>
        <div class="muted">🏷️ Spec ID: <b class="mono">${escape(specId)}</b></div>
      </div>
    </div>

    <div class="card hoverable" style="margin:0 0 14px;">
      <div class="sectionTitle">📊 By model</div>
      <div class="note">Each card summarizes outcomes for a selected model across all test cases.</div>
      <div class="hr"></div>
      <div class="grid" style="margin:0;">${modelCards}</div>
    </div>

    <div class="card hoverable" style="padding:0; overflow:hidden;">
      <div style="padding:16px 16px 0;">
        <div class="sectionTitle">🧾 Detailed results</div>
        <div class="note">One row per case × model. Use the severity columns to quickly identify failures and high-impact issues.</div>
      </div>
      <div style="padding:16px;">
        <table>
          <thead>
            <tr>
              <th>Case</th>
              <th>Model</th>
              <th>Status</th>
              <th class="num">Critical</th>
              <th class="num">High</th>
              <th class="num">Medium</th>
              <th class="num">Low</th>
              <th class="num">Latency (ms)</th>
              <th class="num">In tok</th>
              <th class="num">Out tok</th>
              <th class="num">Cost</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </div>
    </div>

    ${footerHtml}
  </div>
</body>
</html>`;
}

/**
 * PDFKit is streaming; we collect chunks into a Buffer.
 *
 * FIXES INCLUDED:
 * - Page numbers drawn INSIDE margins (prevents blank pages containing only "Page X")
 * - Page number aligned right
 * - First page landscape, subsequent pages portrait
 * - No empty "Page X" pages
 * - Table ordering matches HTML (via sortDetailedRows)
 * - Avoid orphan table header (header always followed by at least 1 row)
 *
 * IMPORTANT (fixes your TS errors):
 * - No template literals inside the PDF section (prevents stray backticks / unterminated literals)
 * - Avoid any invisible “invalid characters” from copy/paste by using plain ASCII in PDF strings
 *
 * ✅ VERCEL-SAFE CHANGE (Node-only deps are loaded lazily):
 * - Avoid top-level imports of `pdfkit`, `node:fs`, `node:path` so this file won’t crash builds
 *   if something accidentally gets evaluated in Edge bundles.
 * - If called in Edge runtime, we fail fast with a clear error.
 */
export function toPDF(bundle: RunBundle): Promise<Buffer> {
  // Fail fast if someone tries to run this in Edge.
  // (Edge runtime has no `fs`/`path`/`pdfkit` support.)
  if (process.env.NEXT_RUNTIME === "edge") {
    return Promise.reject(
      new Error("toPDF failed: PDF generation requires Node.js runtime (not Edge).")
    );
  }

  // Lazy-load Node-only deps (keeps Vercel bundling safer)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("node:fs") as typeof import("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("node:path") as typeof import("node:path");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const PDFDocumentMod = require("pdfkit") as any;
  const PDFDocument = (PDFDocumentMod?.default ?? PDFDocumentMod) as typeof import("pdfkit");

  type PDFDoc = InstanceType<typeof PDFDocument>;

  const safeNum = (n: unknown, fallback = 0) =>
    typeof n === "number" && Number.isFinite(n) ? n : fallback;

  const safeText = (v: unknown) => {
    const s = String(v ?? "");
    return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, " ");
  };

  const fileExists = (p: string) => {
    try {
      return fs.existsSync(p) && fs.statSync(p).isFile();
    } catch {
      return false;
    }
  };

  const resolveFont = (relCandidates: string[]) => {
    const cwd = process.cwd();
    for (const rel of relCandidates) {
      const p = path.resolve(cwd, rel);
      if (fileExists(p)) return p;
    }
    return null;
  };

  const regularFontPath =
    resolveFont([
      "public/fonts/Inter-Regular.ttf",
      "public/fonts/InterVariable.ttf",
      "public/fonts/Roboto-Regular.ttf",
      "public/fonts/DejaVuSans.ttf",
    ]) ?? null;

  const boldFontPath =
    resolveFont([
      "public/fonts/Inter-Bold.ttf",
      "public/fonts/Roboto-Bold.ttf",
      "public/fonts/DejaVuSans-Bold.ttf",
    ]) ?? null;

  if (!regularFontPath) {
    return Promise.reject(
      new Error(
        [
          "toPDF failed: No TTF/OTF font found.",
          "Fix: add these files to your repo:",
          "  - public/fonts/Inter-Regular.ttf",
          "  - public/fonts/Inter-Bold.ttf (optional but recommended)",
        ].join("\n")
      )
    );
  }

  return new Promise<Buffer>((resolve, reject) => {
    let done = false;

    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      reject(new Error("toPDF failed: PDF generation timed out."));
    }, 25_000);

    const finishOk = (buf: Buffer) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(buf);
    };

    const finishErr = (err: unknown) => {
      if (done) return;
      done = true;
      clearTimeout(timer);

      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "string"
            ? err
            : (() => {
                try {
                  return JSON.stringify(err);
                } catch {
                  return String(err);
                }
              })();

      reject(new Error("toPDF failed: " + msg));
    };

    let doc: PDFDoc | null = null;
    const chunks: Buffer[] = [];

    const fmtInt = (n: unknown) => Math.round(safeNum(n, 0)).toLocaleString("en-US");
    const fmtUsd = (n: unknown, digits = 6) => "$" + safeNum(n, 0).toFixed(digits);
    const fmtMs = (n: unknown) => Math.round(safeNum(n, 0)).toLocaleString("en-US") + " ms";
    const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

    try {
      doc = new PDFDocument({ size: "A4", layout: "landscape", margin: 48 });

      doc.on("data", (c: Buffer | Uint8Array) =>
        chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c))
      );
      doc.on("end", () => finishOk(Buffer.concat(chunks)));
      doc.on("error", (err: unknown) => finishErr(err));

      doc.registerFont("Body", regularFontPath);
      if (boldFontPath) doc.registerFont("BodyBold", boldFontPath);

      const fontBody = () => doc!.font("Body");
      const fontBold = () => (boldFontPath ? doc!.font("BodyBold") : doc!.font("Body"));
      fontBody();

      const colors: Record<string, string> = {
        fg: "#0b1220",
        muted: "#5b677a",
        line: "#e6eaf2",
        bg: "#ffffff",
        soft: "#f8fafc",
        soft2: "#fcfdff",
        ok: "#16a34a",
        bad: "#e11d48",
        warn: "#d97706",
      };

      const page = () => doc!.page;
      const contentWidth = () => page().width - page().margins.left - page().margins.right;
      const leftX = () => page().margins.left;
      const rightX = () => page().width - page().margins.right;
      const topY = () => page().margins.top;
      const bottomY = () => page().height - page().margins.bottom;

      const resetX = () => {
        doc!.x = leftX();
      };

      let pageNo = 1;

      const stampPageNumber = () => {
        const y = bottomY() - 12;
        const savedX = doc!.x;
        const savedY = doc!.y;

        doc!.save();
        fontBody();
        doc!.fillColor(colors.muted).fontSize(8);
        doc!.text("Page " + String(pageNo), leftX(), y, {
          width: contentWidth() - 6,
          align: "right",
          lineBreak: false,
        });
        doc!.restore();

        doc!.x = savedX;
        doc!.y = savedY;
      };

      const stampBuiltByTopRight = () => {
        const y = Math.max(10, topY() - 26);
        const savedX = doc!.x;
        const savedY = doc!.y;

        doc!.save();
        fontBody();
        doc!.fillColor(colors.muted).fontSize(8);
        doc!.text("Built by Wiqi Lee", leftX(), y, {
          width: contentWidth() - 6,
          align: "right",
          lineBreak: false,
        });
        doc!.restore();

        doc!.x = savedX;
        doc!.y = savedY;
      };

      const addPortraitPage = () => {
        stampPageNumber();

        doc!.addPage({ size: "A4", layout: "portrait", margin: 48 });
        pageNo += 1;

        stampBuiltByTopRight();

        doc!.y = topY();
        resetX();
      };

      const ensureSpace = (needed: number) => {
        if (doc!.y + needed <= bottomY()) return;
        addPortraitPage();
      };

      const roundRect = (x: number, y: number, w: number, h: number, r: number) => {
        const rr = clamp(r, 0, Math.min(w, h) / 2);
        doc!.roundedRect(x, y, w, h, rr);
      };

      const drawCard = (x: number, y: number, w: number, h: number) => {
        doc!.save();
        doc!.lineWidth(1);
        doc!.fillColor(colors.bg);
        doc!.strokeColor(colors.line);
        roundRect(x, y, w, h, 12);
        doc!.fillAndStroke();
        doc!.restore();
      };

      const drawPill = (
        x: number,
        y: number,
        text: string,
        tone: "ok" | "bad" | "warn" | "neutral"
      ) => {
        const paddingX = 7;
        const paddingY = 3;
        const fontSize = 8.5;

        doc!.save();
        fontBold();
        doc!.fontSize(fontSize);

        const tw = doc!.widthOfString(text);
        const w = tw + paddingX * 2;
        const h = fontSize + paddingY * 2 + 2;

        let fill = colors.soft;
        let stroke = colors.line;
        let fg = colors.muted;

        if (tone === "ok") {
          fill = "#ecfdf5";
          stroke = "#bbf7d0";
          fg = colors.ok;
        } else if (tone === "bad") {
          fill = "#fff1f2";
          stroke = "#fecdd3";
          fg = colors.bad;
        } else if (tone === "warn") {
          fill = "#fffbeb";
          stroke = "#fde68a";
          fg = colors.warn;
        }

        doc!.fillColor(fill).strokeColor(stroke).lineWidth(1);
        roundRect(x, y, w, h, 999);
        doc!.fillAndStroke();

        doc!.fillColor(fg);
        doc!.text(text, x + paddingX, y + paddingY + 1, { lineBreak: false });

        doc!.restore();
        return { w, h };
      };

      const write = (text: string, opts?: any) => {
        resetX();
        doc!.text(text, leftX(), doc!.y, { width: contentWidth(), ...opts });
      };

      const hr = (y?: number) => {
        const yy = typeof y === "number" ? y : doc!.y;
        doc!.save();
        doc!.strokeColor(colors.line).lineWidth(1);
        doc!.moveTo(leftX(), yy).lineTo(rightX(), yy).stroke();
        doc!.restore();
      };

      const toneFromPassPct = (pct: number): "ok" | "warn" | "bad" | "neutral" => {
        if (!Number.isFinite(pct)) return "neutral";
        if (pct >= 80) return "ok";
        if (pct >= 50) return "warn";
        if (pct > 0) return "bad";
        return "neutral";
      };

      const labelFromPassPct = (pct: number) => {
        if (!Number.isFinite(pct)) return "N/A";
        if (pct >= 80) return "Strong";
        if (pct >= 50) return "Mixed";
        if (pct > 0) return "Weak";
        return "No passes";
      };

      const drawBulletList = (items: string[], fontSize = 10) => {
        const bulletIndent = 12;
        const dotRadius = 2.2;

        fontBody();
        doc!.fillColor(colors.muted).fontSize(fontSize);

        items.forEach((b) => {
          ensureSpace(18);
          resetX();

          const x = leftX();
          const y = doc!.y + 5;

          doc!.save();
          doc!.fillColor("#94a3b8");
          doc!.circle(x + dotRadius, y, dotRadius).fill();
          doc!.restore();

          doc!.fillColor(colors.muted);
          doc!.text(b, x + bulletIndent, doc!.y, {
            width: contentWidth() - bulletIndent,
            lineGap: 2,
          });
          doc!.moveDown(0.3);
        });
      };

      const drawOrderedList = (items: string[], fontSize = 10) => {
        fontBody();
        doc!.fillColor(colors.muted).fontSize(fontSize);

        items.forEach((t, i) => {
          ensureSpace(18);
          resetX();

          const prefix = String(i + 1) + ". ";
          const px = leftX();
          const py = doc!.y;

          doc!.fillColor(colors.muted);
          doc!.text(prefix, px, py, { width: 18, lineBreak: false });

          doc!.text(t, px + 18, py, { width: contentWidth() - 18, lineGap: 2 });
          doc!.moveDown(0.25);
        });
      };

      stampBuiltByTopRight();

      const byModel = (bundle.totals?.byModel ?? []) as Array<any>;
      const totalCases = safeNum((bundle.totals as any)?.totalCases, 0);
      const totalRuns = safeNum((bundle.totals as any)?.totalRows, 0);

      const overallPass = byModel.reduce((acc, m) => acc + safeNum(m.pass, 0), 0);
      const overallTotal = byModel.reduce((acc, m) => acc + safeNum(m.total, 0), 0);
      const overallPassRate = overallTotal > 0 ? Math.round((overallPass / overallTotal) * 100) : 0;

      const scored = byModel.map((m) => {
        const total = safeNum(m.total, 0);
        const pass = safeNum(m.pass, 0);
        const passRate = total > 0 ? pass / total : 0;
        const avgLatency = safeNum(m.avg_latency_ms, 0);
        const cost = safeNum(m.cost_usd, 0);
        return { model: safeText(m.model), total, pass, passRate, avgLatency, cost };
      });

      const bestModel =
        scored
          .slice()
          .sort(
            (a, b) =>
              b.passRate - a.passRate || a.avgLatency - b.avgLatency || a.model.localeCompare(b.model)
          )[0] ?? null;

      const worstModel =
        scored
          .slice()
          .sort(
            (a, b) =>
              a.passRate - b.passRate || b.avgLatency - a.avgLatency || a.model.localeCompare(b.model)
          )[0] ?? null;

      const fastestModel =
        scored
          .slice()
          .sort(
            (a, b) =>
              a.avgLatency - b.avgLatency || b.passRate - a.passRate || a.model.localeCompare(b.model)
          )[0] ?? null;

      const cheapestModel =
        scored
          .slice()
          .sort(
            (a, b) => a.cost - b.cost || b.passRate - a.passRate || a.model.localeCompare(b.model)
          )[0] ?? null;

      const costTotal = byModel.reduce((acc, m) => acc + safeNum(m.cost_usd, 0), 0);

      const latencyAvgAll = (() => {
        const total = byModel.reduce((acc, m) => acc + safeNum(m.total, 0), 0);
        if (total <= 0) return 0;
        const sum = byModel.reduce((acc, m) => {
          const t = safeNum(m.total, 0);
          const avg = safeNum(m.avg_latency_ms, 0);
          return acc + t * avg;
        }, 0);
        return sum / total;
      })();

      const topIssues = (() => {
        const list = (bundle.rows ?? []).slice().map((r) => ({
          case_id: safeText((r as any).case_id),
          model: safeText((r as any).model),
          critical: safeNum((r as any).critical, 0),
          high: safeNum((r as any).high, 0),
          medium: safeNum((r as any).medium, 0),
          low: safeNum((r as any).low, 0),
          latency_ms: safeNum((r as any).latency_ms, 0),
          cost_usd: safeNum((r as any).cost_usd, 0),
        }));

        list.sort((a, b) => {
          if (b.critical !== a.critical) return b.critical - a.critical;
          if (b.high !== a.high) return b.high - a.high;
          if (b.medium !== a.medium) return b.medium - a.medium;
          if (b.low !== a.low) return b.low - a.low;
          return b.latency_ms - a.latency_ms;
        });

        return list.slice(0, 5);
      })();

      const tz = resolveReportTimeZone(bundle);
      const createdSplit = formatCreatedAt(bundle.createdAt, tz);

      // Header
      doc!.y = topY();
      resetX();

      fontBold();
      doc!.fillColor(colors.fg).fontSize(20);
      write("ModelSpec Harness Report");

      doc!.moveDown(0.3);
      fontBody();
      doc!.fillColor(colors.muted).fontSize(10);

      const meta =
        "Run: " +
        safeText(bundle.runId) +
        "\n" +
        "Spec: " +
        safeText(bundle.specId) +
        "\n" +
        "Date: " +
        safeText(createdSplit.dateLabel) +
        "\n" +
        "Time (" +
        safeText(createdSplit.timeZoneLabel) +
        "): " +
        safeText(createdSplit.timeLabel);

      resetX();
      doc!.text(meta, leftX(), doc!.y, { width: contentWidth(), lineGap: 2 });

      doc!.moveDown(0.8);
      hr();
      doc!.moveDown(1.0);

      // Summary cards
      const cardsY = doc!.y;
      const gap = 10;
      const cw = contentWidth();
      const cardW = (cw - gap * 2) / 3;
      const cardH = 78;
      const x0 = leftX();

      const card1 = { x: x0, y: cardsY, w: cardW, h: cardH };
      const card2 = { x: x0 + cardW + gap, y: cardsY, w: cardW, h: cardH };
      const card3 = { x: x0 + (cardW + gap) * 2, y: cardsY, w: cardW, h: cardH };

      drawCard(card1.x, card1.y, card1.w, card1.h);
      drawCard(card2.x, card2.y, card2.w, card2.h);
      drawCard(card3.x, card3.y, card3.w, card3.h);

      const writeCard = (
        c: { x: number; y: number; w: number; h: number },
        title: string,
        value: string,
        sub: string,
        pill?: { text: string; tone: "ok" | "bad" | "warn" | "neutral" }
      ) => {
        const pad = 12;

        doc!.save();

        doc!.fillColor(colors.muted);
        fontBold();
        doc!.fontSize(9);
        doc!.text(title.toUpperCase(), c.x + pad, c.y + 10, { width: c.w - pad * 2 });

        doc!.fillColor(colors.fg);
        fontBold();
        doc!.fontSize(20);
        doc!.text(value, c.x + pad, c.y + 26, { width: c.w - pad * 2 });

        doc!.fillColor(colors.muted);
        fontBody();
        doc!.fontSize(9);
        doc!.text(sub, c.x + pad, c.y + 54, { width: c.w - pad * 2 });

        if (pill) {
          fontBold();
          doc!.fontSize(9);
          const tw = doc!.widthOfString(pill.text);
          const px = c.x + c.w - pad - (tw + 14);
          drawPill(px, c.y + 12, pill.text, pill.tone);
        }

        doc!.restore();
      };

      writeCard(
        card1,
        "Overall pass rate",
        String(overallPassRate) + "%",
        fmtInt(overallPass) + " / " + fmtInt(overallTotal) + " runs passed",
        { text: fmtInt(totalCases) + " cases", tone: "neutral" }
      );

      writeCard(
        card2,
        "Total",
        fmtInt(totalRuns),
        "model-runs evaluated, avg latency " + fmtMs(latencyAvgAll),
        { text: fmtUsd(costTotal, 6), tone: "neutral" }
      );

      const bestPct = bestModel ? Math.round(bestModel.passRate * 100) : 0;
      writeCard(
        card3,
        "Best model",
        bestModel ? String(bestPct) + "%" : "-",
        bestModel
          ? bestModel.model + " - " + fmtMs(bestModel.avgLatency) + " avg latency"
          : "No model summary available",
        {
          text: bestModel ? labelFromPassPct(bestPct) : "N/A",
          tone: bestModel ? toneFromPassPct(bestPct) : "neutral",
        }
      );

      doc!.y = cardsY + cardH + 18;
      resetX();

      // How to read (no emojis)
      fontBold();
      doc!.fillColor(colors.fg).fontSize(12);
      write("How to read this report (quick guide)");
      doc!.moveDown(0.35);

      drawBulletList(
        [
          "Pass rate is the percentage of runs that meet the spec for a given model. Higher is better.",
          "Severity: Critical typically fails a case; High/Medium/Low are recorded issues that may still be acceptable depending on policy.",
          "Latency is response time. Lower latency matters for interactive experiences.",
          "Cost is an estimate based on token usage and your configured rate card. Use it for relative comparisons, not billing.",
          "If a model has no matching rate entry, its cost will show as $0.0000.",
          "If you need more detail, open violations.jsonl for per-run evidence and explanations.",
        ],
        10
      );
      doc!.moveDown(0.25);

      // Conclusion (no emojis)
      ensureSpace(85);
      resetX();

      fontBold();
      doc!.fillColor(colors.fg).fontSize(12);
      write("Conclusion");
      doc!.moveDown(0.35);

      const conclusionBullets: string[] = [];

      if (bestModel) {
        conclusionBullets.push(
          "Best reliability: " +
            bestModel.model +
            " (" +
            String(Math.round(bestModel.passRate * 100)) +
            "% pass, " +
            fmtMs(bestModel.avgLatency) +
            " avg latency)."
        );
      } else {
        conclusionBullets.push("Best reliability: -");
      }

      if (worstModel) {
        conclusionBullets.push(
          "Lowest reliability: " +
            worstModel.model +
            " (" +
            String(Math.round(worstModel.passRate * 100)) +
            "% pass, " +
            fmtMs(worstModel.avgLatency) +
            " avg latency)."
        );
      } else {
        conclusionBullets.push("Lowest reliability: -");
      }

      if (fastestModel) {
        conclusionBullets.push(
          "Fastest average latency: " + fastestModel.model + " (" + fmtMs(fastestModel.avgLatency) + ")."
        );
      }
      if (cheapestModel) {
        conclusionBullets.push(
          "Lowest estimated cost: " + cheapestModel.model + " (" + fmtUsd(cheapestModel.cost, 6) + ")."
        );
      }

      conclusionBullets.push(
        "Recommendation: Use the best-pass model for compliance baselines, and validate faster/cheaper options against Critical rules before production."
      );

      drawBulletList(conclusionBullets, 10);
      doc!.moveDown(0.25);

      // Top problem rows (no emojis)
      ensureSpace(60);
      resetX();

      fontBold();
      doc!.fillColor(colors.fg).fontSize(12);
      write("Top problem rows (quick scan)");
      doc!.moveDown(0.35);

      const topIssueLines =
        topIssues.length > 0
          ? topIssues.map((x) => {
              const sev =
                x.critical > 0
                  ? "Critical"
                  : x.high > 0
                    ? "High"
                    : x.medium > 0
                      ? "Medium"
                      : x.low > 0
                        ? "Low"
                        : "None";
              const counts =
                "C:" +
                String(x.critical) +
                " H:" +
                String(x.high) +
                " M:" +
                String(x.medium) +
                " L:" +
                String(x.low);
              return (
                x.case_id +
                " / " +
                x.model +
                " - " +
                sev +
                " (" +
                counts +
                "), " +
                fmtMs(x.latency_ms) +
                ", " +
                fmtUsd(x.cost_usd, 6)
              );
            })
          : ["No rows were produced."];

      drawOrderedList(topIssueLines, 10);
      doc!.moveDown(0.25);

      // Table
      ensureSpace(40);
      resetX();

      fontBold();
      doc!.fillColor(colors.fg).fontSize(12);
      write("Detailed results");
      doc!.moveDown(0.25);

      fontBody();
      doc!.fillColor(colors.muted).fontSize(9.5);
      write(
        "One row per case and model. Scan severity first (Critical > High > Medium > Low), then compare latency and cost.",
        { lineGap: 2 }
      );
      doc!.moveDown(0.8);

      const rowsSorted = sortDetailedRows(bundle.rows ?? []);

      const computeCol = () => {
        const w = contentWidth();

        let fixed = {
          case: 68,
          status: 44,
          crit: 18,
          high: 18,
          med: 18,
          low: 18,
          ms: 52,
          cost: 62,
        };

        const fixedSum =
          fixed.case +
          fixed.status +
          fixed.crit +
          fixed.high +
          fixed.med +
          fixed.low +
          fixed.ms +
          fixed.cost;

        let model = w - fixedSum;

        if (model < 140) {
          fixed = { ...fixed, case: 62, status: 40, ms: 48, cost: 58 };
          const fixedSum2 =
            fixed.case +
            fixed.status +
            fixed.crit +
            fixed.high +
            fixed.med +
            fixed.low +
            fixed.ms +
            fixed.cost;
          model = w - fixedSum2;
        }

        model = Math.max(120, model);

        const fixedSumFinal =
          fixed.case +
          fixed.status +
          fixed.crit +
          fixed.high +
          fixed.med +
          fixed.low +
          fixed.ms +
          fixed.cost;

        model = w - fixedSumFinal;

        const widths = {
          case: fixed.case,
          model,
          status: fixed.status,
          crit: fixed.crit,
          high: fixed.high,
          med: fixed.med,
          low: fixed.low,
          ms: fixed.ms,
          cost: fixed.cost,
        };

        const x = leftX();
        const xs = {
          case: x,
          model: x + widths.case,
          status: x + widths.case + widths.model,
          crit: x + widths.case + widths.model + widths.status,
          high: x + widths.case + widths.model + widths.status + widths.crit,
          med: x + widths.case + widths.model + widths.status + widths.crit + widths.high,
          low:
            x +
            widths.case +
            widths.model +
            widths.status +
            widths.crit +
            widths.high +
            widths.med,
          ms:
            x +
            widths.case +
            widths.model +
            widths.status +
            widths.crit +
            widths.high +
            widths.med +
            widths.low,
          cost:
            x +
            widths.case +
            widths.model +
            widths.status +
            widths.crit +
            widths.high +
            widths.med +
            widths.low +
            widths.ms,
        };

        return { widths, xs };
      };

      let col = computeCol();

      const headerH = 22;
      const rowH = 20;

      const ensureTableHeaderAndOneRow = () => {
        const needed = headerH + 6 + rowH + 2;
        if (doc!.y + needed <= bottomY()) return;
        addPortraitPage();
      };

      const drawTableHeader = () => {
        ensureTableHeaderAndOneRow();
        ensureSpace(headerH + 6);
        resetX();

        col = computeCol();

        const y = doc!.y;

        doc!.save();
        doc!.fillColor(colors.soft);
        doc!.strokeColor(colors.line);
        doc!.lineWidth(1);
        roundRect(leftX(), y, contentWidth(), headerH, 10);
        doc!.fillAndStroke();
        doc!.restore();

        fontBold();
        doc!.fillColor(colors.fg).fontSize(9);

        const cy = y + 6;

        doc!.text("Case", col.xs.case + 8, cy, { width: col.widths.case - 10, lineBreak: false });
        doc!.text("Model", col.xs.model + 8, cy, { width: col.widths.model - 10, lineBreak: false });
        doc!.text("Status", col.xs.status + 6, cy, { width: col.widths.status - 8, lineBreak: false });

        doc!.text("C", col.xs.crit, cy, { width: col.widths.crit, align: "center", lineBreak: false });
        doc!.text("H", col.xs.high, cy, { width: col.widths.high, align: "center", lineBreak: false });
        doc!.text("M", col.xs.med, cy, { width: col.widths.med, align: "center", lineBreak: false });
        doc!.text("L", col.xs.low, cy, { width: col.widths.low, align: "center", lineBreak: false });

        doc!.text("Latency", col.xs.ms, cy, { width: col.widths.ms - 6, align: "right", lineBreak: false });
        doc!.text("Cost", col.xs.cost, cy, { width: col.widths.cost - 6, align: "right", lineBreak: false });

        doc!.y = y + headerH + 6;
      };

      const drawRow = (r: ComplianceRow, idx: number) => {
        if (doc!.y + rowH + 2 > bottomY()) {
          addPortraitPage();

          fontBold();
          doc!.fillColor(colors.fg).fontSize(12);
          write("Detailed results (continued)");
          doc!.moveDown(0.3);

          fontBody();
          doc!.fillColor(colors.muted).fontSize(9.5);
          write("Run: " + safeText(bundle.runId) + " / Spec: " + safeText(bundle.specId));
          doc!.moveDown(0.6);

          drawTableHeader();
        }

        resetX();

        const y = doc!.y;
        const zebra = idx % 2 === 0;

        doc!.save();
        doc!.fillColor(zebra ? colors.soft2 : colors.bg);
        doc!.strokeColor(colors.line);
        doc!.lineWidth(1);
        doc!.rect(leftX(), y, contentWidth(), rowH).fillAndStroke();
        doc!.restore();

        const padX = 8;
        const cy = y + 6;

        const pass = safeNum((r as any).pass, 0) === 1;

        fontBody();
        doc!.fontSize(9);
        doc!.fillColor(colors.fg);

        doc!.text(safeText((r as any).case_id), col.xs.case + padX, cy, {
          width: col.widths.case - padX * 2,
          lineBreak: false,
          ellipsis: true as any,
        });

        doc!.text(safeText((r as any).model), col.xs.model + padX, cy, {
          width: col.widths.model - padX * 2,
          lineBreak: false,
          ellipsis: true as any,
        });

        drawPill(col.xs.status + 4, y + 5, pass ? "PASS" : "FAIL", pass ? "ok" : "bad");

        fontBody();
        doc!.fillColor(colors.fg).fontSize(9);

        doc!.text(fmtInt((r as any).critical), col.xs.crit, cy, { width: col.widths.crit, align: "center", lineBreak: false });
        doc!.text(fmtInt((r as any).high), col.xs.high, cy, { width: col.widths.high, align: "center", lineBreak: false });
        doc!.text(fmtInt((r as any).medium), col.xs.med, cy, { width: col.widths.med, align: "center", lineBreak: false });
        doc!.text(fmtInt((r as any).low), col.xs.low, cy, { width: col.widths.low, align: "center", lineBreak: false });

        doc!.fillColor(colors.muted);

        doc!.text(fmtInt((r as any).latency_ms), col.xs.ms, cy, { width: col.widths.ms - 6, align: "right", lineBreak: false });
        doc!.text(fmtUsd((r as any).cost_usd, 6), col.xs.cost, cy, { width: col.widths.cost - 6, align: "right", lineBreak: false });

        doc!.y = y + rowH;
      };

      drawTableHeader();
      rowsSorted.forEach((r, i) => drawRow(r, i));

      doc!.moveDown(0.4);
      ensureSpace(28);
      resetX();

      fontBody();
      doc!.fillColor(colors.muted).fontSize(9);
      write("Legend: C = Critical, H = High, M = Medium, L = Low", { lineGap: 2 });

      doc!.moveDown(0.4);
      ensureSpace(30);
      resetX();

      fontBody();
      doc!.fillColor(colors.muted).fontSize(9);
      write(
        "Tip: For complete evidence and rule explanations, download violations.jsonl. For spreadsheet workflows, use compliance_table.csv.",
        { lineGap: 2 }
      );

      stampPageNumber();
      doc!.end();
    } catch (e) {
      try {
        if (doc) doc.end();
      } catch {
        // ignore
      }
      finishErr(e);
    }
  });
}
