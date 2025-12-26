# 🧾 ModelSpec Harness (Enterprise)

Treat policies like code. Test them across models. Ship with confidence.

**ModelSpec Harness** is a spec-driven, multi-model compliance harness for LLM workflows. Define a **policy, SOP, or specification** once, run the same **test suite** across **OpenAI and Groq** models, and export reproducible, audit-ready artifacts.

---

## 🚀 Live demo (Vercel)

**Live demo:** [modelspec-harness-wiqi.vercel.app](https://modelspec-harness-wiqi.vercel.app/)

**Note on downloads in the Vercel demo:** Vercel functions run in a stateless environment, so the demo does not persist artifacts to disk.  
Instead, the API returns all artifacts inline via the `artifacts_inline` payload (HTML, CSV, JSONL, PDF), and the UI downloads them directly from that data.

✅ **Local runs are unaffected.** When running locally, artifacts are persisted under `./runs/<runId>/`, and downloads work normally from disk.

---

## 🌟 Key benefits

### For engineering teams
- Predictable, spec-based behavior testing instead of prompt guesswork  
- Deterministic checks that are stable and CI-friendly  
- Easy model portability and side-by-side evaluations  
- Clear visibility into reliability, latency, and cost trade-offs  

### For product and operations
- Higher confidence at launch and after model upgrades  
- Faster iteration with reusable test suites  
- Early detection of policy drift and model overreach  

### For compliance and governance
- Audit-ready HTML, PDF, CSV, and JSONL artifacts  
- Full reproducibility with local run history  
- Clear evidence trails and rule-level explanations  
- Deterministic-by-default design with optional LLM judgment  

---

## 📦 What each run produces

- ✅ PASS/FAIL per test case and per model
- 🚨 Violations with severity (Critical, High, Medium, Low)
- ⏱️ Latency and token usage
- 💸 Cost estimates (rate-card configurable)
- 📄 Shareable HTML reports
- 🧾 Machine-readable artifacts (JSONL)

Built by **Wiqi Lee** · 𝕏: **[@wiqi_lee](https://x.com/wiqi_lee)**  
Supported providers: **OpenAI**, **Groq**

> ⚠️ Disclaimer: This project is **not affiliated with, endorsed by, or sponsored by OpenAI or Groq**.

---

## 🎯 Why this exists

In real-world production workflows (support, operations, compliance, internal tools), failures rarely come from raw model capability. They usually come from:

- Policy or SOP non-compliance  
- Over-promising or unsafe commitments  
- Behavioral drift across prompts, temperatures, or providers  
- Lack of auditability and reproducibility  
- Missing artifacts for review and sign-off  

ModelSpec Harness provides a **reproducible compliance gate** you can run locally or in CI.

---

## 🧠 How evaluation works

ModelSpec Harness supports two complementary evaluation modes.

### 1) Deterministic checks (local, CI-friendly)
Fast, repeatable rule validation that runs locally, including:
- Required fields
- Forbidden phrases
- Max-length constraints
- Pattern-based rules

Use this mode for automated gating and baseline enforcement.

### 2) LLM auditor (strict JSON verdict)
An optional second-pass audit using a separate model call for nuanced judgment, including:
- Implied promises
- Uncertainty handling
- Tone and subtle policy violations

Use this mode for deeper reviews and audit narratives.

---

## 📁 Run artifacts (audit-grade)

Each run is saved locally under:

`./runs/<runId>/`

Artifacts produced include:
- `meta.json` — Run metadata and settings
- `violations.jsonl` — Evidence and rule hits
- `compliance_table.csv` — Spreadsheet-friendly summary
- `report.html` — Shareable review report
- `report.pdf` — Portable audit report

---

## 💸 Cost estimation

Costs are **estimates**, computed from token usage multiplied by your configured rate card.

- Useful for relative comparisons across models
- Helpful for planning and trade-off analysis
- Not intended to match provider invoices

---

## ⚡ Quickstart

### 1) Install
```bash
npm install
```

### 2) Configure environment
Create an env file and add provider keys.

```bash
cp .env.example .env
```

Then set one or both keys:

```bash
OPENAI_API_KEY=sk_your_key_here
GROQ_API_KEY=gsk_your_key_here
```

✅ You may configure **only one provider** if needed.

### 3) Run
```bash
npm run dev
```

Open: `http://localhost:3000`

---

## 🔌 Providers

- **OpenAI**: set `OPENAI_API_KEY`
- **Groq**: set `GROQ_API_KEY`

The UI uses **provider-prefixed model IDs**, for example:
- `openai:gpt-4o-mini`
- `groq:llama-3.1-70b-versatile`

---

## 🧩 Specs (YAML)

A spec defines compliance rules such as:
- Required fields
- Forbidden phrases
- Uncertainty handling
- Max-length constraints

The UI validates the YAML before execution.

---

## 🧪 CI-friendly usage

Recommended CI workflow:
- Use **Deterministic checks (local, CI-friendly)** for stable gating
- Archive `./runs/<runId>/report.html`, `report.pdf`, `compliance_table.csv`, `violations.jsonl`, and `meta.json` as build artifacts

Typical CI commands:
```bash
npm run lint
npm run build
```

---

## 🗺️ Project structure

```text
app/
  api/          # run endpoints and artifact downloads
  page.tsx      # web UI
lib/
  evaluator.ts  # rule engine and optional auditor
  reporters.ts  # CSV, HTML, and PDF exports
  storage.ts    # run persistence
  providers/    # OpenAI and Groq clients
runs/           # generated artifacts (gitignored)
```

---

## 🧱 Tech stack

- **Next.js** (App Router) + **TypeScript**
- **Tailwind CSS**
- `p-limit` for concurrency
- `pdfkit` for PDF generation
- `js-yaml` + `zod` for spec parsing and validation

---

## 🔐 Security and data handling

- All artifacts are generated and stored locally under `./runs/<runId>/`
- Specs and test cases should never include secrets or API keys
- Reports may include prompts and model outputs; handle and share accordingly
- Intended for internal and controlled environments

---

## 📜 License

MIT. See [LICENSE](LICENSE).
