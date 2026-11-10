import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyReleaseMetadata, verifyReleaseBytes } from './release-verification.mjs';
import { allowedPackageFile } from './package-files.mjs';

test('release verification binds prerelease assets and CI to exact tag commit', () => {
  const commit = 'a'.repeat(40), tag = 'v0.1.2';
  const release = { tag_name: tag, draft: false, prerelease: true, assets: ['kyuob-postrail-0.1.2.tgz', 'SHA256SUMS'].map(name => ({ name, state: 'uploaded', size: 100 })) };
  const checks = [{ headSha: commit, status: 'completed', conclusion: 'success' }];
  assert.equal(verifyReleaseMetadata(release, tag, commit, checks), 'kyuob-postrail-0.1.2.tgz');
  for (const patch of [{ draft: true }, { prerelease: false }, { tag_name: 'v0.1.0' }, { assets: [...release.assets, release.assets[0]] }, { assets: release.assets.map(a => ({ ...a, size: 0 })) }]) assert.throws(() => verifyReleaseMetadata({ ...release, ...patch }, tag, commit, checks));
  assert.throws(() => verifyReleaseMetadata(release, tag, commit, [{ ...checks[0], headSha: 'b'.repeat(40) }]));
  assert.throws(() => verifyReleaseMetadata(release, tag, commit, [{ ...checks[0], conclusion: 'failure' }]));
  assert.throws(() => verifyReleaseMetadata(release, tag, commit, [{ ...checks[0], conclusion: 'failure' }, ...checks]));
});
test('shared package allowlist rejects credentials, histories and traversal', () => {
  for (const entry of ['package/dist/cli.js', 'package/docs/images.md', 'package/package.json']) assert(allowedPackageFile(entry));
  for (const entry of ['package/.env', 'package/.postrail/state.json', 'package/../secret', '/etc/passwd', 'package/docs/deep/secret.md']) assert(!allowedPackageFile(entry));
});
test('checksum verification rejects corruption, wrong names, extra entries and malformed hashes', () => {
  const name = 'kyuob-postrail-0.1.2.tgz', bytes = Buffer.from('fixture archive'), hash = createHash('sha256').update(bytes).digest('hex');
  const sums = `${hash}  ${name}\n`;
  assert.equal(verifyReleaseBytes(name, bytes, sums), hash);
  assert.throws(() => verifyReleaseBytes(name, Buffer.from('changed'), sums));
  for (const bad of [sums + sums, sums.replace(name, 'other.tgz'), sums.replace(name, '../other.tgz'), sums.replace(hash, 'x'.repeat(64))]) assert.throws(() => verifyReleaseBytes(name, bytes, bad));
});
