// Manual-only live acceptance test. Never run this in CI.
// Requires fresh user approval for this exact sample and the selected account.
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const args = process.argv.slice(2);
assert(
  args.length === 3 &&
    args[0] === "--account" &&
    /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(args[1]) &&
    args[2] === "--confirm-private-sample",
  "Pass --account NAME --confirm-private-sample only after the human approves the sample draft and same-ID update.",
);
const account = args[1];
const root = fileURLToPath(new URL("../", import.meta.url));
const directory = path.join(root, ".postrail", "live-keyflow");
const evidenceFile = path.join(directory, "evidence.json");
assert(
  !existsSync(evidenceFile),
  "A prior live test exists. Inspect it and the remote result; this script will not automatically create another post.",
);
mkdirSync(directory, { recursive: true, mode: 0o700 });
const file = path.join(directory, "article.md");
const original = readFileSync(path.join(root, "examples/article.md"));
const sha = (value) => createHash("sha256").update(value).digest("hex");
assert.match(original.toString(), /^---\n[\s\S]*?\nvisibility: draft\n[\s\S]*?\n---\n/);
const evidence = {
  version: 1,
  startedAt: new Date().toISOString(),
  sourceHash: sha(original),
  scope: "approved-private-example-create-and-update",
  status: "started",
};
function save() {
  writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
}
save();
writeFileSync(file, original, { mode: 0o600, flag: "wx" });

function run(command, extra = []) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "dist/cli.js"),
      "keyflow",
      command,
      file,
      ...(command === "check" ? [] : ["--account", account]),
      ...extra,
      "--json",
    ],
    { cwd: root, encoding: "utf8", timeout: 130_000, maxBuffer: 1024 * 1024 },
  );
  assert.ifError(result.error);
  let value;
  try {
    value = JSON.parse(result.stdout);
  } catch {
    throw new Error(
      "Postrail returned an unrecognized result; inspect local and remote state before retrying.",
    );
  }
  assert(
    result.status === 0 && value.ok,
    `Postrail ${command} did not succeed (${value.error?.code ?? "unknown"}); do not re-run blindly.`,
  );
  return value;
}
function privateDraft(result) {
  assert.equal(result.status, "draft");
  assert.equal(result.visibility, "private");
  assert.equal(typeof result.postId, "string");
}

const check = run("check");
assert.equal(check.offline, true);
assert.equal(check.status, "draft");
assert.equal(check.visibility, "private");
assert.equal(
  run("status").state.status,
  "not_submitted",
  "The sample identity already has local history; inspect it before starting.",
);
const created = run("push", ["--confirm"]);
privateDraft(created);
assert.equal(created.updated, false);
assert(readFileSync(file).equals(original));
evidence.created = {
  postId: created.postId,
  url: created.url,
  status: created.status,
  visibility: created.visibility,
};
save();
console.log("PASS: one private draft created; original and working source preserved.");

const unchanged = run("push", ["--confirm"]);
assert.equal(unchanged.skipped, true);
assert.equal(unchanged.postId, created.postId);
evidence.unchangedSkipped = true;
save();
const update = Buffer.concat([original, Buffer.from("\n\nPostrail 비공개 초안 수정 검증 완료.\n")]);
writeFileSync(file, update, { mode: 0o600 });
const updated = run("push", ["--confirm"]);
privateDraft(updated);
assert.equal(updated.updated, true);
assert.equal(updated.postId, created.postId);
assert(readFileSync(file).equals(update));
assert.equal(sha(readFileSync(path.join(root, "examples/article.md"))), evidence.sourceHash);
const local = run("status");
assert.equal(local.state.status, "succeeded");
assert.equal(local.state.postId, created.postId);
evidence.updated = {
  postId: updated.postId,
  url: updated.url,
  status: updated.status,
  visibility: updated.visibility,
};
evidence.journalPath = `.postrail/keyflow/${sha(JSON.stringify([local.articleId, account]))}/state.json`;
evidence.sourcePreserved = true;
evidence.updateHash = sha(update);
evidence.status = "api_verified_remote_readback_pending";
evidence.finishedAt = new Date().toISOString();
save();
console.log(
  "PASS: unchanged upload skipped; same post ID updated as private draft. Record remote readback separately after observing the workspace and preview.",
);
