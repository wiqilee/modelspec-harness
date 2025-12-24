/**
 * Ultra-light smoke test for CI:
 * - Ensures key files exist
 * - Ensures Next build artifacts can be produced (handled by next build in workflow)
 */
import fs from "node:fs";
import path from "node:path";

const mustExist = [
  "app/page.tsx",
  "app/api/run/route.ts",
  "lib/tinkerClient.ts",
  "README.md",
  "LICENSE",
];

let ok = true;
for (const p of mustExist) {
  if (!fs.existsSync(path.join(process.cwd(), p))) {
    console.error("Missing:", p);
    ok = false;
  }
}
if (!ok) process.exit(1);
console.log("Smoke test: OK");
