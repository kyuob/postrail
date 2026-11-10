// Read-only maintainer check after the initial GitHub push. Requires Git and gh.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

const run = (command, args) =>
  execFileSync(command, args, { encoding: "utf8", timeout: 30_000 }).trim();
const repo = JSON.parse(run("gh", ["api", "repos/kyuob/postrail"]));
assert.equal(repo.full_name, "kyuob/postrail");
assert.equal(repo.private, false);
assert.equal(repo.default_branch, "main");
assert.equal(repo.license?.spdx_id, "MIT");

const head = run("git", ["rev-parse", "HEAD"]);
const remote = run("gh", ["api", "repos/kyuob/postrail/commits/main", "--jq", ".sha"]);
assert.equal(remote, head, "Local and remote main must match");
assert.equal(run("git", ["status", "--porcelain"]), "", "Working tree must be clean");

const checks = JSON.parse(
  run("gh", [
    "run",
    "list",
    "--repo",
    "kyuob/postrail",
    "--workflow",
    "ci.yml",
    "--branch",
    "main",
    "--limit",
    "5",
    "--json",
    "headSha,status,conclusion",
  ]),
);
assert(
  checks.some(
    (check) =>
      check.headSha === head && check.status === "completed" && check.conclusion === "success",
  ),
  "CI must pass on the pushed commit",
);
console.log(
  `PASS: public repository, MIT license, main ${head.slice(0, 7)}, clean tree and successful CI.`,
);
