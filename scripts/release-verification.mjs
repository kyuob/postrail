import assert from "node:assert/strict";
import { createHash } from "node:crypto";

export function verifyReleaseMetadata(release, tag, commit, checks) {
  assert.match(tag, /^v\d+\.\d+\.\d+$/);
  assert.match(commit, /^[a-f0-9]{40}$/);
  assert.equal(release.tag_name, tag);
  assert.equal(release.draft, false, "Release must be published.");
  assert.equal(release.prerelease, true, "Experimental release must remain a prerelease.");
  const archive = `kyuob-postrail-${tag.slice(1)}.tgz`;
  assert.deepEqual(
    release.assets.map((asset) => asset.name).sort(),
    [archive, "SHA256SUMS"].sort(),
    "Expected exactly the package and checksums.",
  );
  for (const asset of release.assets) {
    assert.equal(asset.state, "uploaded");
    assert(
      Number.isSafeInteger(asset.size) && asset.size > 0 && asset.size <= 8 * 1024 * 1024,
      "Release asset size is invalid.",
    );
  }
  const latest = checks.find((check) => check.headSha === commit);
  assert(
    latest?.status === "completed" && latest.conclusion === "success",
    "Latest CI must pass on the tag commit.",
  );
  return archive;
}

export function verifyReleaseBytes(archive, bytes, sums) {
  const match = /^([a-f0-9]{64})  ([A-Za-z0-9.-]+)\r?\n?$/.exec(sums);
  assert(match, "Expected one strict SHA256SUMS entry.");
  assert.equal(match[2], archive, "Checksum filename must match the release archive.");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  assert.equal(sha256, match[1], "Downloaded archive checksum mismatch.");
  return sha256;
}
