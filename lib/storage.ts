// lib/storage.ts
import fs from "node:fs";
import path from "node:path";

export const RUNS_DIR = path.join(process.cwd(), "runs");

export function ensureRunsDir() {
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

  // Forbid traversal segments explicitly
  // (normalize first to handle things like "a/../b")
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
    // Prevents: "The 'data' argument must be of type string or an instance of Buffer..."
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
 * Writes a file under ./runs/<runId>/<name>
 * Accepts Buffer/string, and safely handles undefined/null to avoid crashes.
 */
export function writeRunFile(runId: string, name: string, content: unknown) {
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
  ensureRunsDir();

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
  const dir = safeRunDir(runId);
  const safeName = safeFileName(name);
  const p = path.join(dir, safeName);
  return fs.readFileSync(p);
}

export function runExists(runId: string): boolean {
  try {
    const dir = safeRunDir(runId);
    return fs.existsSync(dir);
  } catch {
    return false;
  }
}

/**
 * Deletes the entire run folder: ./runs/<runId>
 * Returns true if deleted, false if not deleted.
 */
export function deleteRun(runId: string): boolean {
  ensureRunsDir();
  const dir = safeRunDir(runId);

  if (!fs.existsSync(dir)) return false;

  fs.rmSync(dir, { recursive: true, force: true });
  return !fs.existsSync(dir);
}
