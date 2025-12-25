# 🧾 ModelSpec Harness (Enterprise)

Treat policies like code. Test them across models. Ship with confidence.

**ModelSpec Harness** is a spec-driven, multi-model compliance harness for LLM workflows. Define a **policy / SOP / specification** once, run the same **test cases** across multiple **OpenAI + Groq** models, and export reproducible, audit-ready artifacts.

---

## 🚀 Live demo (Vercel)

Demo: `https://modelspec-harness-wiqi.vercel.app/`

**Important note about downloads on the Vercel demo:** Vercel functions run in a **stateless** environment, so the demo does **not** persist artifacts to disk.  
Instead, the API returns all artifacts **inline** in the `artifacts_inline` payload (HTML, CSV, JSONL, PDF), and the UI downloads from that inline data.

✅ **Local runs are unaffected** — when you run locally, artifacts are persisted under `./runs/<runId>/` and downloads work normally from disk.

---

## 🌟 Key benefits

### For engineering teams
- Predictable, spec-based behavior testing instead of prompt guesswork
- Deterministic checks that are stable and CI-safe
- Easy model portability and side-by-side benchmarking
- Clear reliability, latency, and cost tradeoffs

### For product and operations
- Higher confidence at launch and after model upgrades
- Faster iteration with reusable test cases
- Early detection of policy drift and over-promising

### For compliance and governance
- Audit-ready HTML, PDF, CSV, and JSONL artifacts
- Full reproducibility with local run history
- Clear evidence and rule-level explanations
- Deterministic-first design with optional LLM judgment

---

## 📦 What you get per run

- ✅ PASS/FAIL per case and per model
- 🚨 Violations with severity (Critical, High, Medium, Low)
- ⏱️ Latency and token usage
- 💸 Cost estimates (rate-card configurable)
- 📄 Shareable HTML reports
- 🧾 Machine-readable evidence (JSONL)

Built by **Wiqi Lee** — 𝕏: **[@wiqi_lee](https://x.com/wiqi_lee)**  
Provider routing: **OpenAI** + **Groq**

> ⚠️ Disclaimer: This project is **not affiliated with or endorsed by OpenAI or Groq**.

---

## 🎯 Why this exists

In real production workflows (support, operations, compliance, internal tools), failures are rarely about model intelligence. They are usually about:

- the model not following policy or SOP
- over-promising or unsafe commitments
- behavioral drift across prompts, temperatures, or providers
- lack of auditability and reproducibility
- missing artifacts for review and sign-off

ModelSpec Harness provides a **reproducible compliance gate** you can run locally or in CI.

---

## 🧠 How evaluation works

ModelSpec Harness supports two complementary evaluation modes.

### 1) Deterministic checks (local-only)
Fast, repeatable, and CI-friendly rule validation, including:
- required fields
- forbidden phrases
- max length constraints
- pattern-based rules

Use this mode for automated gating and baseline enforcement.

### 2) LLM auditor (strict JSON verdict)
An optional second model call for nuanced judgment, such as:
- implied promises
- uncertainty handling
- tone and subtle policy violations

Use this mode for deeper reviews and audit narratives.

---

## 📁 Run artifacts (audit-grade)

Each run is stored locally under:

`./runs/<runId>/`

Artifacts include:
- `meta.json` — run metadata and settings
- `violations.jsonl` — evidence and rule hits
- `compliance_table.csv` — spreadsheet-friendly summary
- `report.html` — shareable review report
- `report.pdf` — portable audit report

---

## 💸 Cost estimation

Cost is an **estimate**, calculated from token usage multiplied by your configured rate card.

- Useful for relative comparisons across models
- Helpful for planning and tradeoff analysis
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
- required fields
- forbidden phrases
- uncertainty handling
- max length constraints

The UI validates YAML before execution.

---

## 🧪 CI-friendly usage

Recommended CI pattern:
- Use **Deterministic (local-only)** mode for stable gating
- Archive `./runs/<runId>/report.html`, `report.pdf`, `compliance_table.csv`, `violations.jsonl`, and `meta.json` as build artifacts

Typical commands:
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

- Next.js (App Router) and TypeScript
- Tailwind CSS
- p-limit for concurrency
- pdfkit for PDF generation
- js-yaml and zod for specs and validation

---

## 🔐 Security and data handling

- All artifacts are generated and stored locally under `./runs`
- Specs and cases should not contain secrets or API keys
- Reports may include prompts and model outputs; handle accordingly
- Suitable for internal and controlled environments

---

## 📜 License

- MIT — see [LICENSE](LICENSE).
