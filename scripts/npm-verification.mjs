import assert from "node:assert/strict";
import { createHash } from "node:crypto";
export function verifyNpmArtifact(meta, name, version, bytes, expected) {
  assert.equal(meta.name, name);
  assert.equal(meta.version, version);
  assert.equal(meta.dist?.tarball, `https://registry.npmjs.org/${name}/-/postrail-${version}.tgz`);
  assert.equal(
    meta.dist?.integrity,
    "sha512-" + createHash("sha512").update(bytes).digest("base64"),
    "Registry integrity differs from downloaded bytes.",
  );
  assert.deepEqual(bytes, expected, "Registry package differs from the tested local archive.");
  return createHash("sha256").update(bytes).digest("hex");
}
