// Public, credential-free registry readback. Never writes to npm.
import assert from 'node:assert/strict';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyNpmArtifact } from './npm-verification.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json')));
const [archive, ...extra] = process.argv.slice(2); assert(archive && !extra.length, 'Usage: node scripts/verify-npm.mjs tested-archive.tgz');
async function download(url, limit) {
  assert.equal(new URL(url).origin, 'https://registry.npmjs.org');
  const response = await fetch(url, { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(20000) });
  assert.equal(response.status, 200, 'Registry readback failed.'); const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try { for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.byteLength; assert(size <= limit, 'Oversized registry response.'); chunks.push(Buffer.from(value)); } }
  finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}
const meta = JSON.parse(await download(`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${pkg.version}`, 2 * 1024 * 1024));
const url = `https://registry.npmjs.org/${pkg.name}/-/postrail-${pkg.version}.tgz`;
assert.equal(meta.dist?.tarball, url);
const sha256 = verifyNpmArtifact(meta, pkg.name, pkg.version, await download(url, 8 * 1024 * 1024), readFileSync(path.resolve(archive)));
const latest = JSON.parse(await download(`https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/latest`, 2 * 1024 * 1024));
assert.equal(latest.version, pkg.version, 'Default install does not resolve to this version.');
const base = path.join(root, '.postrail/npm-recovery-20261110'); mkdirSync(base, { recursive: true, mode: 0o700 });
writeFileSync(path.join(base, 'registry-proof.json'), JSON.stringify({ name: pkg.name, version: pkg.version, sha256, latest: true, testedArchiveMatches: true }, null, 2), { mode: 0o600 });
console.log(`PASS npm: ${pkg.name}@${pkg.version}, latest tag, registry SHA512 and exact tested archive bytes.`);
