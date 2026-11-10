// Read-only GitHub verification. Downloads into ignored local evidence only.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { verifyReleaseMetadata, verifyReleaseBytes } from './release-verification.mjs';
import { allowedPackageFile } from './package-files.mjs';

const [tag, expectedCommit, expectedArchive, ...extra] = process.argv.slice(2);
assert.equal(extra.length, 0, 'Unexpected arguments.');
if (expectedArchive) assert(expectedCommit, 'Expected archive requires the expected commit.');
assert.match(tag || '', /^v\d+\.\d+\.\d+$/, 'Usage: node scripts/verify-release.mjs vX.Y.Z [expected-commit]');
if (expectedCommit) assert.match(expectedCommit, /^[a-f0-9]{40}$/);
const root = fileURLToPath(new URL('../', import.meta.url));
const run = (command, args) => execFileSync(command, args, { cwd: root, encoding: 'utf8', timeout: 60000, maxBuffer: 8 * 1024 * 1024 }).trim();
const repo = 'kyuob/postrail';
const release = JSON.parse(run('gh', ['api', `repos/${repo}/releases/tags/${tag}`]));
// The commits endpoint resolves lightweight and annotated tags to their commit.
const commit = run('gh', ['api', `repos/${repo}/commits/${tag}`, '--jq', '.sha']);
if (expectedCommit) assert.equal(commit, expectedCommit, 'Tag points to a different commit.');
const checks = JSON.parse(run('gh', ['run', 'list', '--repo', repo, '--workflow', 'ci.yml', '--commit', commit, '--limit', '100', '--json', 'headSha,status,conclusion']));
const archive = verifyReleaseMetadata(release, tag, commit, checks);
const base = path.join(root, '.postrail/improvements-20261110'); mkdirSync(base, { recursive: true, mode: 0o700 });
const work = mkdtempSync(path.join(base, 'release-'));
run('gh', ['release', 'download', tag, '--repo', repo, '--dir', work, '--pattern', archive, '--pattern', 'SHA256SUMS']);
const bytes = readFileSync(path.join(work, archive));
for (const asset of release.assets) assert.equal(readFileSync(path.join(work, asset.name)).length, asset.size, 'Downloaded asset size differs from metadata.');
const sha256 = verifyReleaseBytes(archive, bytes, readFileSync(path.join(work, 'SHA256SUMS'), 'utf8'));
if (expectedArchive) assert.deepEqual(bytes, readFileSync(path.resolve(expectedArchive)), 'Release differs from the locally tested archive.');
const entries = run('tar', ['-tzf', path.join(work, archive)]).split(/\r?\n/);
for (const entry of entries) assert(allowedPackageFile(entry), 'Unexpected package file in release.');
for (const entry of ['package/package.json', 'package/dist/cli.js', 'package/LICENSE', 'package/README.md']) assert(entries.includes(entry), 'Required package file missing.');
const pkg = JSON.parse(run('tar', ['-xOzf', path.join(work, archive), 'package/package.json']));
assert.equal(pkg.name, '@kyuob/postrail'); assert.equal(pkg.version, tag.slice(1)); assert.equal(pkg.private, true);
assert(!run('tar', ['-tvzf', path.join(work, archive)]).split(/\r?\n/).some(line => /^[lh]/.test(line)), 'Archive contains a link.');
writeFileSync(path.join(work, 'proof.json'), JSON.stringify({ tag, commit, sha256, matchesTestedArchive: !!expectedArchive, assets: release.assets.map(({ name, size }) => ({ name, size })), passed: true }, null, 2), { mode: 0o600 });
console.log(`PASS release: ${tag}, exact tag commit ${commit.slice(0, 7)}, passing CI, prerelease, package identity and downloaded asset checksums.`);
