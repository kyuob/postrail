import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const { version } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));

// Check the built artifact with Node, not just the source with Bun.
function run(args) {
  const result = spawnSync("node", ["dist/cli.js", ...args], {
    cwd: root,
    encoding: "utf8",
    timeout: 10_000,
  });
  assert.ifError(result.error);
  return result;
}

for (const args of [[], ["--help"], ["-h"], ["help"]]) {
  const result = run(args);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Postrail/);
  assert.match(result.stdout, /postrail publish/);
  assert.equal(result.stderr, "");
}

for (const args of [["--version"], ["-v"]]) {
  const result = run(args);
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), version);
  assert.equal(result.stderr, "");
}

const unconfirmed = run(["publish", "article.md"]);
assert.equal(unconfirmed.status, 1);
assert.match(unconfirmed.stderr, /PUBLISH_CONFIRM_REQUIRED/);
for (const args of [["--unknown"], ["--help", "publish"]]) {
  const result = run(args);
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Unsupported command/);
}

console.log("PASS: built CLI help/version and unsupported-command exit behavior (9 checks).");
