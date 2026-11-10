import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("../", import.meta.url));
const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url)));
assert.equal(pkg.private, false);
assert.equal(pkg.name, "@kyuob/postrail");
assert.equal(pkg.publishConfig.registry, "https://registry.npmjs.org/");
assert.equal(pkg.publishConfig.access, "public");
const out = spawnSync(
  "bun",
  ["publish", "--dry-run", "--access=public", "--registry=https://registry.npmjs.org/"],
  { cwd: root, encoding: "utf8", timeout: 60000, maxBuffer: 2 * 1024 * 1024 },
);
assert.ifError(out.error);
assert.equal(out.status, 0, "Publication dry-run failed; raw output withheld.");
console.log(
  `PASS publish dry-run: ${pkg.name}@${pkg.version}, public npm registry; no registry write.`,
);
