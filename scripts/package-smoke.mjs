import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync, lstatSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const base = path.join(root, '.postrail/stage7'); mkdirSync(base, { recursive: true, mode: 0o700 });
const work = mkdtempSync(path.join(base, 'package-')), output = path.join(work, 'archive'); mkdirSync(output);
function run(command, args, cwd = root, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, encoding: 'utf8', timeout: 180000, maxBuffer: 4 * 1024 * 1024 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `Package verification command failed: ${path.basename(command)} ${args[0]}; exit=${result.status}. Output withheld.`);
  return result.stdout;
}
const pkg = JSON.parse(readFileSync(path.join(root, 'package.json')));
assert.equal(pkg.private, true); // Packing and local install do not authorize publication.
run('bun', ['pm', 'pack', '--destination', output, '--quiet']);
const archive = path.join(output, `${pkg.name}-${pkg.version}.tgz`); assert(existsSync(archive));
const entries = run('tar', ['-tzf', archive]).trim().split(/\r?\n/).filter(Boolean);
const allowed = name => /^package\/(?:package\.json|LICENSE|README(?:\.ko)?\.md|CHANGELOG\.md|CONTRIBUTING\.md|SECURITY\.md|dist\/cli\.js|docs\/[A-Za-z0-9._-]+\.md|examples\/[A-Za-z0-9._-]+\.(?:md|json))$/.test(name);
for (const entry of entries) assert(allowed(entry), `Unexpected package entry: ${entry}`);
for (const required of ['package/package.json', 'package/dist/cli.js', 'package/LICENSE', 'package/README.ko.md', 'package/docs/installation.md', 'package/docs/login.md', 'package/docs/faq.md', 'package/SECURITY.md', 'package/CHANGELOG.md']) assert(entries.includes(required), `Missing package file: ${required}`);
assert(!run('tar', ['-tvzf', archive]).split(/\r?\n/).some(line => /^[lh]/.test(line)), 'Package must not include symlink/hardlink entries.');
const consumer = path.join(work, 'consumer'), home = path.join(work, 'home'); mkdirSync(consumer); mkdirSync(home, { mode: 0o700 });
writeFileSync(path.join(consumer, 'package.json'), JSON.stringify({ name: 'postrail-install-smoke', private: true, type: 'module', dependencies: { postrail: pathToFileURL(archive).href } }, null, 2));
const env = { ...process.env, HOME: home, USERPROFILE: home };
run('bun', ['install', '--ignore-scripts'], consumer, env);
const installed = path.join(consumer, 'node_modules/postrail');
assert.equal(JSON.parse(readFileSync(path.join(installed, 'package.json'))).version, pkg.version);
assert(existsSync(path.join(consumer, 'node_modules/playwright-core/package.json')));
assert(existsSync(path.join(consumer, 'node_modules/@keyflow-blog/cli/package.json')));
const cli = path.join(installed, 'dist/cli.js'); assert(readFileSync(cli, 'utf8').startsWith('#!/usr/bin/env node'));
if (process.platform !== 'win32') assert(lstatSync(cli).mode & 0o111, 'Installed CLI must be executable.');
assert.equal(run(process.execPath, [cli, '--version'], consumer, env).trim(), pkg.version);
assert.match(run(process.execPath, [cli, '--help'], consumer, env), /postrail publish/);
const binDir = path.join(consumer, 'node_modules/.bin');
const bin = process.platform === 'win32' ? path.join(binDir, 'postrail.exe') : path.join(binDir, 'postrail'); assert(existsSync(bin), 'Installed bin launcher missing.');
assert.match(run(bin, ['--help'], consumer, env), /Postrail/);
const example = path.join(installed, 'examples/blogger.md');
assert.equal(JSON.parse(run(process.execPath, [cli, 'validate', example, '--json'], consumer, env)).ok, true);
const dry = JSON.parse(run(process.execPath, [cli, 'publish', example, '--to', 'velog,blogger', '--destinations', path.join(installed, 'examples/destinations.json'), '--dry-run', '--json'], consumer, env));
assert.equal(dry.ok, true); assert.equal(dry.offline, true); assert.deepEqual(dry.results, []);
const proof = { ok: true, platform: process.platform, arch: process.arch, node: process.version, bun: run('bun', ['--version']).trim(), version: pkg.version,
 archive: path.relative(root, archive), sha256: createHash('sha256').update(readFileSync(archive)).digest('hex'), fileCount: entries.length,
 installedBin: true, externalDependencies: true, offlineCli: true, published: false };
writeFileSync(path.join(base, 'package-proof.json'), JSON.stringify(proof, null, 2) + '\n', { mode: 0o600 });
console.log(`PASS package: ${entries.length} allowlisted files, clean local install, external dependencies, executable bin and offline CLI; ${process.platform}/${process.arch}, Node ${process.version}. No publication/authentication performed.`);
