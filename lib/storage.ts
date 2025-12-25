// lib/storage.ts
import fs from "node:fs";
import path from "node:path";

/**
 * Local: keep exactly the same behavior as before -> ./runs
 * Vercel (Serverless): use writable ephemeral filesystem -> /tmp/runs
 *
 * This makes the demo work on Vercel without crashing, while keeping local unchanged.
 *
 * You can override manually:
 * - RUNS_DIR=/some/path            => force a custom runs directory
 * - DISABLE_RUNS_PERSIST=1         => always disable writes/reads (demo no-history mode)
 */
function resolveRunsDir(): string {
  // Manual override first
  const override = process.env.RUNS_DIR;
  if (override && override.trim()) return path.resolve(override.trim());

  // Vercel sets VERCEL=1 at runtime
  if (process.env.VERCEL === "1") return "/tmp/runs";

  // Local/default
  return path.join(process.cwd(), "runs");
}

export const RUNS_DIR = resolveRunsDir();

function isRunsPersistenceEnabled(): boolean {
  // Explicit disable wins
  if (process.env.DISABLE_RUNS_PERSIST === "1") return false;

  // Default: enabled everywhere (local + Vercel) because Vercel will use /tmp
  return true;
}

export function ensureRunsDir() {
  if (!isRunsPersistenceEnabled()) return;
  if (!fs.existsSync(RUNS_DIR)) fs.mkdirSync(RUNS_DIR, { recursive: true });
}

/**
 * Prevent path traversal (e.g. runId = "../../etc").
 * Ensures all run paths stay inside RUNS_DIR.
 */
function safeRunDir(runId: string) {
  const id = String(runId || "").trim();
  const dir = path.resolve(RUNS_DIR, id);
  const root = path.resolve(RUNS_DIR);

  if (!id) throw new Error("Invalid runId.");
  if (!dir.startsWith(root + path.sep)) throw new Error("Invalid runId (path traversal).");

  return dir;
}

/**
 * Validate a filename (no traversal, no absolute paths).
 * Allows subfolders like "artifacts/report.pdf" but still confined within run dir.
 */
function safeFileName(name: string) {
  const n = String(name || "").trim();
  if (!n) throw new Error("Invalid file name.");
  if (path.isAbsolute(n)) throw new Error("Invalid file name (absolute path).");

  // Normalize separators
  const normalized = n.replace(/\\/g, "/");

  // Normalize path (posix) and forbid traversal
  const cleaned = path.posix.normalize(normalized);

  if (cleaned === "." || cleaned === "..") throw new Error("Invalid file name.");
  if (cleaned.startsWith("../") || cleaned.includes("/../")) {
    throw new Error("Invalid file name (path traversal).");
  }
  if (cleaned.startsWith("/")) throw new Error("Invalid file name (absolute path).");

  return cleaned;
}

/**
 * Coerce any unknown content into a safe, writable payload.
 * - Buffer stays Buffer
 * - string stays string
 * - null/undefined becomes empty string (prevents fs.writeFileSync crash)
 * - Uint8Array becomes Buffer
 * - other objects become JSON
 */
function normalizeContent(content: unknown): Buffer | string {
  if (Buffer.isBuffer(content)) return content;
  if (typeof content === "string") return content;

  if (content === null || content === undefined) {
    return "";
  }

  if (content instanceof Uint8Array) return Buffer.from(content);

  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

/**
 * Atomic-ish write:
 * write temp file then rename, so readers won't see partially written files.
 */
function writeFileAtomic(filePath: string, data: Buffer | string) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath);
  const tmp = path.join(dir, `.${base}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`);

  fs.writeFileSync(tmp, data);
  fs.renameSync(tmp, filePath);
}

/**
 * Writes a file under RUNS_DIR/<runId>/<name>
 * Accepts Buffer/string, and safely handles undefined/null to avoid crashes.
 */
export function writeRunFile(runId: string, name: string, content: unknown) {
  if (!isRunsPersistenceEnabled()) return;

  ensureRunsDir();

  const dir = safeRunDir(runId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const safeName = safeFileName(name);
  const filePath = path.join(dir, safeName);

  // Ensure parent folder exists if name contains subfolders.
  const parent = path.dirname(filePath);
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });

  const data = normalizeContent(content);

  try {
    writeFileAtomic(filePath, data);
  } catch (e: any) {
    const msg = typeof e?.message === "string" ? e.message : String(e);
    throw new Error(`writeRunFile failed for "${safeName}" (runId="${runId}"): ${msg}`);
  }
}

export function listRuns(): Array<{ runId: string; createdAt: string }> {
  if (!isRunsPersistenceEnabled()) return [];

  ensureRunsDir();

  if (!fs.existsSync(RUNS_DIR)) return [];

  const dirs = fs
    .readdirSync(RUNS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  return dirs
    .map((runId) => {
      let createdAt = "";
      try {
        const dir = safeRunDir(runId);
        const metaPath = path.join(dir, "meta.json");
        if (fs.existsSync(metaPath)) {
          const meta = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
          createdAt = typeof meta?.createdAt === "string" ? meta.createdAt : "";
        }
      } catch {
        // Ignore bad dirs / invalid meta
      }
      return { runId, createdAt };
    })
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function readRunFile(runId: string, name: string): Buffer {
  if (!isRunsPersistenceEnabled()) {
    throw new Error("readRunFile is disabled in this environment (runs persistence disabled).");
  }

  const dir = safeRunDir(runId);
  const safeName = safeFileName(name);
  const p = path.join(dir, safeName);

  return fs.readFileSync(p);
}

export function runExists(runId: string): boolean {
  if (!isRunsPersistenceEnabled()) return false;

  try {
    const dir = safeRunDir(runId);
    return fs.existsSync(dir);
  } catch {
    return false;
  }
}

/**
 * Deletes the entire run folder: RUNS_DIR/<runId>
 * Returns true if deleted, false if not deleted.
 */
export function deleteRun(runId: string): boolean {
  if (!isRunsPersistenceEnabled()) return false;

  ensureRunsDir();
  const dir = safeRunDir(runId);

  if (!fs.existsSync(dir)) return false;

  fs.rmSync(dir, { recursive: true, force: true });
  return !fs.existsSync(dir);
}
