import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadArticle, loadConfig, fail } from '../src/core.js';
import { publishArticle, loadDestinations } from '../src/publish.js';

function fixture(t, visibility = 'private', targets = ['velog', 'tistory']) {
  const cwd = mkdtempSync(path.join(tmpdir(), 'postrail-publish-')); t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const file = path.join(cwd, 'article.md');
  writeFileSync(file, `---\nid: publish-test\ntitle: Common publish test\nvisibility: ${visibility}\ntargets: [${targets.join(', ')}]\n---\nOriginal **body**.\n`);
  const article = loadArticle(file, loadConfig(path.join(cwd, 'postrail.json')), targets);
  const mapping = { version: 1, destinations: { velog: { account: 'tester' }, tistory: { blog: 'test-blog', blogId: '123' }, blogger: { account: 'tester', blogId: '456' }, keyflow: { account: 'tester' } } };
  const destinationsFile = path.join(cwd, 'destinations.json'); writeFileSync(destinationsFile, JSON.stringify(mapping));
  return { cwd, file, article, mapping, destinationsFile, destinations: loadDestinations(destinationsFile) };
}
function mocked(failure) {
  const calls = [];
  const implementations = Object.fromEntries(['velog', 'tistory', 'blogger', 'keyflow'].map(platform => [platform, {
    check: () => { calls.push(`check:${platform}`); return { blockers: [] }; },
    push: async () => { calls.push(`push:${platform}`); if (platform === failure) fail('TISTORY_UNKNOWN_RESULT', 'SECRET'); return { ok: true, postId: platform + '-id' }; },
  }]));
  return { calls, implementations };
}
test('explicit confirmation precedes all adapter checks or writes', async t => {
  const f = fixture(t), m = mocked();
  await assert.rejects(() => publishArticle(f.article, f.destinations, f.cwd, {}, m.implementations), { code: 'PUBLISH_CONFIRM_REQUIRED' });
  assert.deepEqual(m.calls, []); assert.equal(existsSync(path.join(f.cwd, '.postrail')), false);
});
test('dry run checks all targets without authentication, writes, locks or source changes', async t => {
  const f = fixture(t), before = readFileSync(f.file), m = mocked();
  const result = await publishArticle(f.article, f.destinations, f.cwd, { dryRun: true }, m.implementations);
  assert.equal(result.ok, true); assert.equal(result.offline, true); assert.deepEqual(result.results, []);
  assert.deepEqual(m.calls, ['check:velog', 'check:tistory']); assert.equal(existsSync(path.join(f.cwd, '.postrail')), false);
  assert.deepEqual(readFileSync(f.file), before);
});
test('all-target preflight blocks writes when the last target rejects visibility', async t => {
  const f = fixture(t), m = mocked(); m.implementations.tistory.check = () => ({ blockers: ['UNSUPPORTED'] });
  const result = await publishArticle(f.article, f.destinations, f.cwd, { confirmed: true }, m.implementations);
  assert.equal(result.ok, false); assert.equal(result.offline, true); assert.deepEqual(m.calls, ['check:velog']);
  assert.equal(existsSync(path.join(f.cwd, '.postrail')), false);
});
test('partial failure preserves successful target, continues, and never retries unknown writes', async t => {
  const f = fixture(t, 'private', ['velog', 'tistory', 'keyflow']), m = mocked('tistory');
  const result = await publishArticle(f.article, f.destinations, f.cwd, { confirmed: true }, m.implementations);
  assert.equal(result.ok, false); assert.deepEqual(result.results.map(r => r.status), ['succeeded', 'failed', 'succeeded']);
  assert.equal(result.results[1].error.code, 'TISTORY_UNKNOWN_RESULT'); assert.equal(result.results[1].automaticRetry, false);
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
  assert.deepEqual(m.calls, ['check:velog', 'check:tistory', 'check:keyflow', 'push:velog', 'push:tistory', 'push:keyflow']);
});
test('adapter unchanged result is retained and unexpected errors are sanitized', async t => {
  const f = fixture(t), m = mocked();
  m.implementations.velog.push = async () => ({ ok: true, postId: 'existing', skipped: true });
  m.implementations.tistory.push = async () => { throw new Error('SECRET'); };
  const result = await publishArticle(f.article, f.destinations, f.cwd, { confirmed: true }, m.implementations);
  assert.equal(result.results[0].status, 'skipped'); assert.equal(result.results[1].error.code, 'PUBLISH_TARGET_FAILED');
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
});
test('concurrent publish of the same article is rejected and completed locks release', async t => {
  const f = fixture(t), m = mocked(); let release, started;
  const ready = new Promise(resolve => { started = resolve; });
  m.implementations.velog.push = async () => { started(); await new Promise(resolve => { release = resolve; }); return { ok: true, postId: 'saved' }; };
  const first = publishArticle(f.article, f.destinations, f.cwd, { confirmed: true }, m.implementations); await ready;
  await assert.rejects(() => publishArticle(f.article, f.destinations, f.cwd, { confirmed: true }, m.implementations), { code: 'PUBLISH_LOCKED' });
  release(); assert.equal((await first).ok, true);
  const next = mocked(); assert.equal((await publishArticle(f.article, f.destinations, f.cwd, { confirmed: true }, next.implementations)).ok, true);
});
test('missing destination or symlink storage cannot begin sending', async t => {
  const f = fixture(t), m = mocked();
  await assert.rejects(() => publishArticle(f.article, { velog: f.destinations.velog }, f.cwd, { confirmed: true }, m.implementations), { code: 'PUBLISH_DESTINATION_REQUIRED' });
  assert.equal(m.calls.some(c => c.startsWith('push:')), false);
  symlinkSync(f.cwd, path.join(f.cwd, '.postrail'), 'dir');
  await assert.rejects(() => publishArticle(f.article, f.destinations, f.cwd, { confirmed: true }, m.implementations), { code: 'PUBLISH_STORAGE_FAILED' });
});
test('destination files reject credentials, unknown fields, invalid target identity and versions', t => {
  const f = fixture(t);
  for (const value of [{ version: 2, destinations: {} }, { version: 1, destinations: { velog: { account: 'tester', token: 'SECRET' } } }, { version: 1, destinations: { tistory: { blog: 'https://evil.test', blogId: '123' } } }, { version: 1, destinations: { fake: {} } }]) {
    writeFileSync(f.destinationsFile, JSON.stringify(value)); assert.throws(() => loadDestinations(f.destinationsFile), e => !e.message.includes('SECRET'));
  }
});
test('built publish dry-run uses real capability checks while blocking all network and official CLI calls', t => {
  const f = fixture(t, 'draft');
  const guard = path.join(f.cwd, 'guard.cjs');
  writeFileSync(guard, `const deny=()=>{throw Error('FORBIDDEN')};global.fetch=deny;for(const n of ['http','https']){const m=require('node:'+n);m.request=deny;m.get=deny;}require('node:net').Socket.prototype.connect=deny;require('node:child_process').spawnSync=deny;require('node:child_process').spawn=deny;`);
  const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
  const args = ['--require', guard, cli, 'publish', f.file, '--destinations', f.destinationsFile, '--dry-run', '--json'];
  const result = spawnSync(process.execPath, args, { cwd: f.cwd, encoding: 'utf8', timeout: 10000 });
  const value = JSON.parse(result.stdout); assert.equal(result.status, 1); assert.equal(value.offline, true);
  assert.deepEqual(value.preflight[1].blockers, ['TISTORY_DRAFT_UNSUPPORTED']); assert.equal(existsSync(path.join(f.cwd, '.postrail')), false);
  assert.doesNotMatch(result.stdout + result.stderr, /FORBIDDEN/);
});
