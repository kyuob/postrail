// Read-only proof check: does not upload, authenticate, or call the network.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { loadArticle, loadConfig } from "../src/core.js";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const proof = JSON.parse(readFileSync(new URL(".postrail/live-keyflow/evidence.json", root), "utf8"));
const hash = value => createHash("sha256").update(value).digest("hex");
assert.equal(proof.scope, "approved-private-example-create-and-update");
assert.equal(proof.sourceHash, hash(readFileSync(new URL("examples/article.md", root))));
assert.equal(proof.updateHash, hash(readFileSync(new URL(".postrail/live-keyflow/article.md", root))));
assert.equal(proof.sourcePreserved, true);
assert.equal(proof.unchangedSkipped, true);
assert(proof.created.postId && proof.created.postId === proof.updated.postId);
assert.match(proof.journalPath, /^\.postrail\/keyflow\/[a-f0-9]{64}\/state\.json$/);
const journal = JSON.parse(readFileSync(new URL(proof.journalPath, root), "utf8"));
const article = loadArticle(fileURLToPath(new URL(".postrail/live-keyflow/article.md", root)), loadConfig(fileURLToPath(new URL("postrail.json", root))), ["keyflow"]);
assert.equal(journal.status, "succeeded");
assert.equal(journal.postId, proof.created.postId);
assert.equal(journal.articleId, article.meta.id);
assert.equal(journal.contentHash, article.contentHash);
assert.equal(proof.journalPath, `.postrail/keyflow/${hash(JSON.stringify([journal.articleId, journal.account]))}/state.json`);
for (const result of [proof.created, proof.updated]) {
  assert.equal(result.status, "draft");
  assert.equal(result.visibility, "private");
}
assert.equal(proof.status, "verified");
assert.equal(proof.remoteReadback?.samePostId, true);
assert.equal(proof.remoteReadback?.privateDraft, true);
assert.equal(proof.remoteReadback?.updateMarkerVisible, true);
console.log("PASS: private create/update response evidence, source hashes and local journal agree; recorded human/UI readback assertions are present (no autonomous remote verification).");
