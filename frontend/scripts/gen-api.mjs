// Regenerates src/lib/api/schema.d.ts from the FastAPI app (no server or database needed).
// 1. backend/scripts/dump_openapi.py writes the OpenAPI document (via uv, in ../backend);
// 2. openapi-typescript turns it into types; 3. prettier formats the result.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const backend = resolve(root, "../backend");
const output = join(root, "src/lib/api/schema.d.ts");
const workdir = mkdtempSync(join(tmpdir(), "rf-openapi-"));
const spec = join(workdir, "openapi.json");
const bin = (name) => join(root, "node_modules/.bin", name);

try {
  execFileSync("uv", ["run", "python", "scripts/dump_openapi.py", spec], {
    cwd: backend,
    stdio: "inherit",
  });
  execFileSync(bin("openapi-typescript"), [spec, "-o", output], { cwd: root, stdio: "inherit" });
  execFileSync(bin("prettier"), ["--write", output], { cwd: root, stdio: "inherit" });
} finally {
  rmSync(workdir, { recursive: true, force: true });
}
