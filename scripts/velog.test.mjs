import assert from 'node:assert/strict';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, symlinkSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadArticle, loadConfig, contentHashForTargets } from '../src/core.js';
import { inspectVelog, reconcileVelog } from '../src/velog-recovery.js';
import { checkVelog, pushVelog, statusVelog, getVelog, loginVelog } from '../src/velog.js';
import { VelogClient, VELOG_GRAPHQL, VELOG_UPLOAD, authDiagnostic } from '../src/velog-client.js';
import { manualChromeLogin } from '../src/manual-chrome-login.js';
import { EventEmitter } from 'node:events';
import { journalPath, readJournal, saveJournal, locked, digest } from '../src/velog-journal.js';
import { velogImages, replaceVelogImages } from '../src/velog-images.js';
import { equivalentTags } from '../src/tags.js';

test('tag identity rejects folded collisions and invalid input without Unicode folding', () => {
  assert.equal(equivalentTags(['CLI', 'cli'], ['CLI', 'cli']), false);
  assert.equal(equivalentTags(['CLI', 1], ['cli', 1]), false);
  assert.equal(equivalentTags(null, []), false);
  assert.equal(equivalentTags(['Ä'], ['ä']), false);
  assert.equal(equivalentTags(['CLI', '개발'], ['개발', 'cli']), true);
});

const user = { id: 'author-id', username: 'tester' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=', 'base64');
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
function fixture(t, visibility = 'draft', body = '한국어 본문입니다.\n') {
  const dir = mkdtempSync(path.join(tmpdir(), 'postrail-velog-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'article.md');
  const text = `---\nid: velog-test\ntitle: 벨로그 테스트\ntags: [개발, CLI]\nvisibility: ${visibility}\ntargets: [velog]\n---\n${body}`;
  writeFileSync(file, text); writeFileSync(path.join(dir, 'image.png'), png);
  const article = () => loadArticle(file, loadConfig(path.join(dir, 'postrail.json'), false), ['velog']);
  return { dir, file, text, article, state: () => statusVelog(article(), 'tester', dir).state };
}
function server() {
  const state = { writes: [], reads: [], uploads: [], post: null };
  const client = {
    read: async id => { state.reads.push(id); return structuredClone(state.post); },
    write: async (input, update) => {
      state.writes.push({ input: structuredClone(input), update });
      state.post = { ...input, id: input.id ?? 'post-1', user, series: input.series_id ? { id: input.series_id } : null, short_description: input.meta.short_description };
      return structuredClone(state.post);
    },
    upload: async (image, name) => { state.uploads.push({ data: Buffer.from(image.data), name }); return 'https://velog.velcdn.com/images/test/image.png'; },
  };
  const session = async (account, action) => { assert.equal(account, 'tester'); return action(client, user); };
  return { state, client, session };
}
const rejects = (fn, code) => assert.rejects(fn, error => error.code === code);

async function unresolved(t, body = 'PRIVATE_BODY_SENTINEL\n', visibility = 'public') {
  const f = fixture(t, visibility, body), s = server(), read = s.client.read;
  s.client.read = async id => { s.state.post.tags = ['개발', 'Q&A']; return read(id); };
  await rejects(() => pushVelog(f.article(), 'tester', f.dir, true, s.session), 'VELOG_READBACK_FAILED');
  return { f, s, file: journalPath(f.dir, 'tester', 'velog-test', false) };
}
test('recovery inspection is reviewable and leaves journal bytes/files unchanged', async t => {
  const { f, s, file } = await unresolved(t), before = readFileSync(file), files = readdirSync(path.dirname(file));
  const r = await inspectVelog(f.article(), 'tester', f.dir, s.session);
  assert.equal(r.canReconcile, true); assert.equal(r.requiresTagAcceptance, true); assert.equal(r.comparisons.body, true); assert.equal(r.comparisons.tags, false);
  assert.deepEqual(r.tags.actual, ['개발', 'Q&A']); assert.equal(r.visibility.actual, 'public'); assert.match(r.reviewHash, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(r), /PRIVATE_BODY_SENTINEL/); assert.deepEqual(readFileSync(file), before); assert.deepEqual(readdirSync(path.dirname(file)), files);
  assert.equal(s.state.writes.length, 1); assert.equal(s.state.uploads.length, 0);
});
test('reconciliation requires review, confirmation and explicit tag adoption', async t => {
  const { f, s, file } = await unresolved(t), before = readFileSync(file);
  await rejects(() => reconcileVelog(f.article(), 'tester', f.dir, {}, () => assert.fail('must not authenticate')), 'VELOG_RECOVERY_CONFIRM_REQUIRED');
  await rejects(() => reconcileVelog(f.article(), 'tester', f.dir, { confirmed: true }, () => assert.fail('must not authenticate')), 'VELOG_RECOVERY_REVIEW_REQUIRED');
  const review = await inspectVelog(f.article(), 'tester', f.dir, s.session);
  await rejects(() => reconcileVelog(f.article(), 'tester', f.dir, { confirmed: true, reviewHash: review.reviewHash }, s.session), 'VELOG_RECOVERY_TAG_ACCEPT_REQUIRED');
  const r = await reconcileVelog(f.article(), 'tester', f.dir, { confirmed: true, reviewHash: review.reviewHash, acceptTags: true }, s.session);
  assert.equal(r.remoteWritten, false); assert.equal(r.backupVerified, true); assert.equal(r.acceptedTags, true);
  assert.deepEqual(readFileSync(file + '.backup-' + digest(before) + '.json'), before); assert.equal(f.state().status, 'succeeded');
  assert.equal((await pushVelog(f.article(), 'tester', f.dir, true, s.session)).skipped, true); assert.equal(s.state.writes.length, 1);
  s.state.post.body += 'external edit';
  await rejects(() => pushVelog(f.article(), 'tester', f.dir, true, s.session), 'VELOG_REMOTE_CONFLICT'); assert.equal(s.state.writes.length, 1);
  await rejects(() => reconcileVelog(f.article(), 'tester', f.dir, { confirmed: true, reviewHash: review.reviewHash, acceptTags: true }, () => assert.fail('must not authenticate')), 'VELOG_RECOVERY_STATE_INVALID');
});
test('unchanged reviewed post needs no tag-acceptance flag', async t => {
  const { f, s } = await unresolved(t); s.client.read = async () => ({ ...s.state.post, tags: f.article().meta.tags });
  const review = await inspectVelog(f.article(), 'tester', f.dir, s.session); assert.equal(review.requiresTagAcceptance, false);
  assert.equal((await reconcileVelog(f.article(), 'tester', f.dir, { confirmed: true, reviewHash: review.reviewHash }, s.session)).localStatus, 'succeeded');
});
for (const visibility of ['private', 'draft']) test(`recovery preserves both exact ${visibility} flags`, async t => {
  const { f, s } = await unresolved(t, 'body', visibility), review = await inspectVelog(f.article(), 'tester', f.dir, s.session);
  assert.equal(review.comparisons.visibility, true); assert.equal(review.canReconcile, true);
  await reconcileVelog(f.article(), 'tester', f.dir, { confirmed: true, reviewHash: review.reviewHash, acceptTags: true }, s.session);
  assert.equal((await pushVelog(f.article(), 'tester', f.dir, true, s.session)).skipped, true);
});
test('a draft label cannot hide an inconsistent private flag', async t => {
  const { f, s } = await unresolved(t, 'body', 'draft'); s.state.post.is_private = false;
  const review = await inspectVelog(f.article(), 'tester', f.dir, s.session); assert.equal(review.visibility.actual, 'draft'); assert.equal(review.comparisons.visibility, false);
  await rejects(() => reconcileVelog(f.article(), 'tester', f.dir, { confirmed: true, reviewHash: review.reviewHash, acceptTags: true }, s.session), 'VELOG_RECOVERY_MISMATCH');
});
for (const change of ['source', 'remote', 'journal']) test(`stale ${change} review cannot reconcile`, async t => {
  const { f, s, file } = await unresolved(t); const review = await inspectVelog(f.article(), 'tester', f.dir, s.session);
  if (change === 'source') writeFileSync(f.file, f.text + 'changed');
  if (change === 'remote') s.state.post.body += 'changed';
  if (change === 'journal') writeFileSync(file, readFileSync(file, 'utf8') + '\n');
  const before = readFileSync(file);
  await rejects(() => reconcileVelog(f.article(), 'tester', f.dir, { confirmed: true, reviewHash: review.reviewHash, acceptTags: true }, s.session), 'VELOG_RECOVERY_STALE');
  assert.deepEqual(readFileSync(file), before); assert.equal(f.state().status, 'unknown');
});
for (const field of ['body', 'title', 'visibility']) test(`tag acceptance cannot bypass ${field} mismatch`, async t => {
  const { f, s, file } = await unresolved(t);
  if (field === 'visibility') s.state.post.is_private = true; else s.state.post[field] += 'changed';
  const review = await inspectVelog(f.article(), 'tester', f.dir, s.session), before = readFileSync(file); assert.equal(review.canReconcile, false);
  await rejects(() => reconcileVelog(f.article(), 'tester', f.dir, { confirmed: true, reviewHash: review.reviewHash, acceptTags: true }, s.session), 'VELOG_RECOVERY_MISMATCH');
  assert.deepEqual(readFileSync(file), before);
});
test('recovery requires the owned saved ID, not a caller-selected post', async t => {
  const { f, s } = await unresolved(t);
  for (const post of [{ ...s.state.post, id: 'other' }, { ...s.state.post, user: { ...user, id: 'other' } }]) {
    s.client.read = async () => post; await rejects(() => inspectVelog(f.article(), 'tester', f.dir, s.session), 'VELOG_RESPONSE_INVALID');
  }
  const file = journalPath(f.dir, 'tester', 'velog-test', false), state = readJournal(file, 'tester', 'velog-test'); delete state.postId; saveJournal(file, state);
  await rejects(() => inspectVelog(f.article(), 'tester', f.dir, () => assert.fail('must not authenticate')), 'VELOG_NO_REMOTE_ID');
});
test('backup failure and existing lock preserve unresolved state', async t => {
  const { f, s, file } = await unresolved(t), review = await inspectVelog(f.article(), 'tester', f.dir, s.session), before = readFileSync(file);
  writeFileSync(file + '.lock', '');
  await rejects(() => reconcileVelog(f.article(), 'tester', f.dir, { confirmed: true, reviewHash: review.reviewHash, acceptTags: true }, () => assert.fail('must not authenticate')), 'VELOG_LOCKED'); rmSync(file + '.lock');
  writeFileSync(file + '.backup-' + digest(before) + '.json', 'invalid', { mode: 0o600 });
  await rejects(() => reconcileVelog(f.article(), 'tester', f.dir, { confirmed: true, reviewHash: review.reviewHash, acceptTags: true }, s.session), 'VELOG_RECOVERY_BACKUP_FAILED');
  assert.deepEqual(readFileSync(file), before); assert.equal(s.state.writes.length, 1);
});
test('image recovery verifies exact body first, deduplicates CDN reads and pins bytes', async t => {
  const { f, s } = await unresolved(t, '한글😀\n![one](image.png)\n![two][pic]\n\n[pic]: image.png\n'); let fetches = 0;
  const request = async (url, options) => { fetches++; assert.equal(new URL(url).hostname, 'velog.velcdn.com'); assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit'); assert(options.signal instanceof AbortSignal); return new Response(png); };
  const r = await inspectVelog(f.article(), 'tester', f.dir, s.session, request); assert.equal(r.canReconcile, true); assert.equal(r.localImages, 1); assert.equal(fetches, 1);
  s.state.post.body += 'changed'; fetches = 0;
  assert.equal((await inspectVelog(f.article(), 'tester', f.dir, s.session, request)).canReconcile, false); assert.equal(fetches, 0);
});
test('reordered or inconsistent repeated images are rejected before any fetch', async t => {
  const { f, s } = await unresolved(t, '![first](image.png)\n![second](image.png)\n'); const original = s.state.post.body;
  for (const body of [original.replace('![first]', '![other]'), original.replace(/https:\/\/velog.velcdn.com\/images\/test\/image.png(?=>)/, 'https://velog.velcdn.com/different.png')]) {
    s.state.post.body = body;
    assert.equal((await inspectVelog(f.article(), 'tester', f.dir, s.session, () => assert.fail('must not fetch'))).canReconcile, false);
  }
});
test('symlink backup cannot authorize a local journal replacement', async t => {
  const { f, s, file } = await unresolved(t), before = readFileSync(file), review = await inspectVelog(f.article(), 'tester', f.dir, s.session);
  symlinkSync(file, file + '.backup-' + digest(before) + '.json');
  await rejects(() => reconcileVelog(f.article(), 'tester', f.dir, { confirmed: true, reviewHash: review.reviewHash, acceptTags: true }, s.session), 'VELOG_RECOVERY_BACKUP_FAILED');
  assert.deepEqual(readFileSync(file), before);
});
test('an existing exact private backup is verified rather than overwritten', async t => {
  const { f, s, file } = await unresolved(t), before = readFileSync(file), review = await inspectVelog(f.article(), 'tester', f.dir, s.session);
  const backup = file + '.backup-' + digest(before) + '.json'; writeFileSync(backup, before, { mode: 0o600 });
  await reconcileVelog(f.article(), 'tester', f.dir, { confirmed: true, reviewHash: review.reviewHash, acceptTags: true }, s.session);
  assert.deepEqual(readFileSync(backup), before); assert.equal(f.state().status, 'succeeded');
});
for (const operation of ['openSync', 'writeFileSync', 'fsyncSync']) test(`backup ${operation} failure cannot replace unresolved bytes`, async t => {
  const { f, s, file } = await unresolved(t), before = readFileSync(file), review = await inspectVelog(f.article(), 'tester', f.dir, s.session);
  const original = fs[operation], mocked = t.mock.method(fs, operation, (...args) => {
    if (operation === 'openSync' && !String(args[0]).includes('.backup-')) return original(...args);
    throw Error('SYNTHETIC_FAILURE');
  }); syncBuiltinESMExports();
  try { await rejects(() => reconcileVelog(f.article(), 'tester', f.dir, { confirmed: true, reviewHash: review.reviewHash, acceptTags: true }, s.session), 'VELOG_RECOVERY_BACKUP_FAILED'); }
  finally { mocked.mock.restore(); syncBuiltinESMExports(); }
  assert.deepEqual(readFileSync(file), before); assert.equal(f.state().status, 'unknown'); assert.equal(s.state.writes.length, 1);
});
test('recovery supports distinct local sources and preserved authored remote URLs', async t => {
  const { f, s } = await unresolved(t); writeFileSync(path.join(f.dir, 'second.png'), png);
  writeFileSync(f.file, f.text.replace('PRIVATE_BODY_SENTINEL', '![one][first]\n![two](second.png)\n![remote](https://example.test/preserved.png)\n\n[first]: image.png'));
  const a = f.article(), stateFile = journalPath(f.dir, 'tester', 'velog-test', false), state = readJournal(stateFile, 'tester', 'velog-test');
  state.contentHash = a.contentHash; saveJournal(stateFile, state); const refs = velogImages(a);
  s.state.post.body = replaceVelogImages(a, refs, new Map(refs.map(r => [r.source, 'https://velog.velcdn.com/'+r.source]))); let reads = 0;
  const r = await inspectVelog(a, 'tester', f.dir, s.session, async url => { assert.equal(new URL(url).hostname, 'velog.velcdn.com'); reads++; return new Response(png); });
  assert.equal(r.canReconcile, true); assert.equal(r.localImages, 2); assert.equal(reads, 2);
});
for (const bad of ['http://velog.velcdn.com/a.png', 'https://evil.test/a.png', 'https://velog.velcdn.com:444/a.png', 'https://u:p@velog.velcdn.com/a.png']) test(`recovery never fetches untrusted image: ${bad}`, async t => {
  const { f, s } = await unresolved(t, '![one](image.png)'); s.state.post.body = s.state.post.body.replace('https://velog.velcdn.com/images/test/image.png', bad);
  const r = await inspectVelog(f.article(), 'tester', f.dir, s.session, () => assert.fail('must not fetch')); assert.equal(r.canReconcile, false);
});
for (const mode of ['changed', 'oversized', 'redirect', 'timeout']) test(`unverified ${mode} image blocks recovery`, async t => {
  const { f, s } = await unresolved(t, '![one](image.png)'); let cancelled = false;
  const request = async (_url, options) => {
    assert(options.signal instanceof AbortSignal);
    if (mode === 'timeout') throw new DOMException('SECRET', 'TimeoutError');
    if (mode === 'redirect') return new Response('', { status: 302 });
    const bytes = mode === 'oversized' ? Buffer.alloc(png.length + 1) : Buffer.alloc(png.length);
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(bytes); if (mode !== 'oversized') controller.close(); }, cancel() { cancelled = true; } }));
  };
  const r = await inspectVelog(f.article(), 'tester', f.dir, s.session, request); assert.equal(r.canReconcile, false); assert.doesNotMatch(JSON.stringify(r), /SECRET/);
  if (mode === 'oversized') assert.equal(cancelled, true);
});
test('reviewed source target compatibility preserves hash format and avoids a second write', async t => {
  const { f, s, file } = await unresolved(t); const a = f.article(), state = readJournal(file, 'tester', 'velog-test');
  assert.equal(a.contentHash, digest({ ...a.meta, body: a.body, imageHashes: [] }));
  state.contentHash = contentHashForTargets(a, ['velog', 'tistory']); saveJournal(file, state);
  assert.equal(contentHashForTargets(a, ['velog']), a.contentHash); a.meta.targets = ['velog', 'tistory']; a.contentHash = contentHashForTargets(a);
  const review = await inspectVelog(a, 'tester', f.dir, s.session); assert.equal(review.canReconcile, true);
  await reconcileVelog(a, 'tester', f.dir, { confirmed: true, reviewHash: review.reviewHash, acceptTags: true }, s.session);
  assert.equal(readJournal(file, 'tester', 'velog-test').contentHash, state.contentHash);
  assert.equal((await pushVelog(f.article(), 'tester', f.dir, true, s.session)).skipped, true); assert.equal(s.state.writes.length, 1);
});
test('built recovery CLI gates confirmation, target history and missing identity offline', t => {
  const f = fixture(t), guard = path.join(f.dir, 'recovery-guard.cjs');
  writeFileSync(guard, `const deny=()=>{throw Error('FORBIDDEN')};global.fetch=deny;for(const n of ['http','https']){const m=require('node:'+n);m.request=deny;m.get=deny;}require('node:net').Socket.prototype.connect=deny;require('node:child_process').spawnSync=deny;require('node:child_process').spawn=deny;`);
  for (const [action, options, code] of [
    ['inspect', [], 'VELOG_NO_REMOTE_ID'],
    ['inspect', ['--published-to', 'blogger'], 'INVALID_ARGUMENT'],
    ['reconcile', [], 'VELOG_RECOVERY_CONFIRM_REQUIRED'],
    ['reconcile', ['--confirm'], 'VELOG_RECOVERY_REVIEW_REQUIRED'],
  ]) {
    const r = spawnSync(process.execPath, ['--require', guard, cli, 'velog', action, f.file, '--account', 'tester', '--json', ...options], { cwd: f.dir, encoding: 'utf8', timeout: 10000 });
    assert.equal(r.status, 1); assert.equal(JSON.parse(r.stdout).error.code, code); assert.doesNotMatch(r.stdout+r.stderr, /FORBIDDEN/);
  }
  assert.equal(f.state().status, 'not_submitted'); assert.equal(readFileSync(f.file, 'utf8'), f.text);
});

test('folded tag collisions fail offline before session or journal creation', async t => {
  const f = fixture(t, 'public'); writeFileSync(f.file, f.text.replace('[개발, CLI]', '[CLI, cli]'));
  assert.throws(() => checkVelog(f.article()), { code: 'VELOG_TAG_COLLISION' });
  await rejects(() => pushVelog(f.article(), 'tester', f.dir, true, () => assert.fail('must not open session')), 'VELOG_TAG_COLLISION');
  assert.equal(f.state().status, 'not_submitted');
});
test('incomplete owned mutation response retains ID without readback or retry', async t => {
  const f = fixture(t); const s = server();
  s.client.write = async () => { s.state.writes.push({}); return { id: 'partial-post', user }; };
  await rejects(() => pushVelog(f.article(), 'tester', f.dir, true, s.session), 'VELOG_RESPONSE_INVALID');
  assert.equal(f.state().status, 'unknown'); assert.equal(f.state().postId, 'partial-post'); assert.equal(s.state.reads.length, 0);
  await rejects(() => pushVelog(f.article(), 'tester', f.dir, true, () => assert.fail('must not retry')), 'VELOG_UNKNOWN_RESULT');
  assert.equal(s.state.writes.length, 1);
});
for (const owner of [{ ...user, id: 'other' }, { ...user, username: 'other' }, undefined]) test(`untrusted incomplete response never retains ID: ${JSON.stringify(owner)}`, async t => {
  const f = fixture(t); const s = server(); s.client.write = async () => ({ id: 'untrusted-id', user: owner });
  await rejects(() => pushVelog(f.article(), 'tester', f.dir, true, s.session), 'VELOG_RESPONSE_INVALID');
  assert.equal(f.state().status, 'unknown'); assert.equal(f.state().postId, undefined);
});
test('partial update response cannot replace the existing saved ID', async t => {
  const f = fixture(t); const s = server(); await pushVelog(f.article(), 'tester', f.dir, true, s.session);
  writeFileSync(f.file, f.text + '수정'); s.client.write = async () => ({ id: 'different-id', user });
  await rejects(() => pushVelog(f.article(), 'tester', f.dir, true, s.session), 'VELOG_RESPONSE_INVALID');
  assert.equal(f.state().postId, 'post-1'); assert.equal(f.state().status, 'unknown');
});

test('server ASCII tag casing is accepted, but later casing edits still conflict', async t => {
  const f = fixture(t); const s = server();
  const read = s.client.read;
  s.client.read = async id => { s.state.post.tags = s.state.post.tags.map(x => x.toLowerCase()); return read(id); };
  await pushVelog(f.article(), 'tester', f.dir, true, s.session);
  assert.equal((await getVelog(f.article(), 'tester', f.dir, s.session)).matchesLastSaved, true);
  s.client.read = read; s.state.post.tags = ['개발', 'CLI'];
  await rejects(() => pushVelog(f.article(), 'tester', f.dir, true, s.session), 'VELOG_REMOTE_CONFLICT');
});
for (const tags of [['개발'], ['개발', 'other'], ['개발', 'cli', 'cli'], ['開發', 'cli'], ['개발', ' cli']]) test(`changed tag identity is rejected: ${JSON.stringify(tags)}`, async t => {
  const f = fixture(t); const s = server();
  s.client.read = async () => ({ ...s.state.post, tags });
  await rejects(() => pushVelog(f.article(), 'tester', f.dir, true, s.session), 'VELOG_READBACK_FAILED');
});

for (const visibility of ['draft', 'private', 'public']) test(`${visibility}: explicit visibility, create/readback, source preserved`, async t => {
  const f = fixture(t, visibility); const s = server();
  const result = await pushVelog(f.article(), 'tester', f.dir, true, s.session);
  assert.equal(result.readbackVerified, true); assert.equal(result.liveVerified, false);
  assert.equal(s.state.writes[0].input.is_temp, visibility === 'draft');
  assert.equal(s.state.writes[0].input.is_private, visibility !== 'public');
  assert.equal(f.state().status, 'succeeded'); assert.equal(readFileSync(f.file, 'utf8'), f.text);
});
test('unchanged skips only after remote conflict check; changed source updates same ID', async t => {
  const f = fixture(t); const s = server();
  await pushVelog(f.article(), 'tester', f.dir, true, s.session);
  assert.equal((await pushVelog(f.article(), 'tester', f.dir, true, s.session)).skipped, true);
  writeFileSync(f.file, f.text + '추가 문장.\n');
  assert.equal((await pushVelog(f.article(), 'tester', f.dir, true, s.session)).updated, true);
  assert.equal(s.state.writes[1].input.id, 'post-1'); assert.equal(s.state.writes[1].update, true);
  assert.equal((await getVelog(f.article(), 'tester', f.dir, s.session)).matchesLastSaved, true);
  s.state.post.body += 'remote edit';
  await rejects(() => pushVelog(f.article(), 'tester', f.dir, true, s.session), 'VELOG_REMOTE_CONFLICT');
  assert.equal(s.state.writes.length, 2);
});
test('confirmation and account gates precede session calls', async t => {
  const f = fixture(t); const denied = () => { throw Error('SESSION_MUST_NOT_OPEN'); };
  await rejects(() => pushVelog(f.article(), 'tester', f.dir, false, denied), 'VELOG_CONFIRM_REQUIRED');
  await rejects(() => pushVelog(f.article(), '../bad', f.dir, true, denied), 'VELOG_ACCOUNT_REQUIRED');
  await rejects(() => pushVelog(f.article(), 'tester', f.dir, true, async (_a, action) => action({}, { ...user, username: 'other' })), 'VELOG_ACCOUNT_MISMATCH');
});
test('write response loss blocks automatic retry', async t => {
  const f = fixture(t); const s = server();
  s.client.write = async () => { throw Error('PRIVATE_SERVER_ERROR'); };
  await rejects(() => pushVelog(f.article(), 'tester', f.dir, true, s.session), 'VELOG_UNKNOWN_RESULT');
  assert.equal(f.state().status, 'unknown');
  await rejects(() => pushVelog(f.article(), 'tester', f.dir, true, () => { throw Error('MUST_NOT_OPEN'); }), 'VELOG_UNKNOWN_RESULT');
});
test('readback mismatch retains returned ID and blocks retry', async t => {
  const f = fixture(t); const s = server();
  s.client.read = async () => ({ ...s.state.post, body: 'wrong body' });
  await rejects(() => pushVelog(f.article(), 'tester', f.dir, true, s.session), 'VELOG_READBACK_FAILED');
  assert.equal(f.state().postId, 'post-1'); assert.equal(f.state().status, 'unknown');
});
test('metadata edits outside Postrail conflict; updates preserve summary, series and thumbnail', async t => {
  const f = fixture(t); const s = server();
  const original = s.client.write;
  s.client.write = async (...args) => {
    const p = await original(...args);
    Object.assign(s.state.post, { thumbnail: 'https://velog.velcdn.com/t.png', short_description: 'summary', series: { id: 'series-1' } });
    return { ...p, ...s.state.post };
  };
  await pushVelog(f.article(), 'tester', f.dir, true, s.session);
  writeFileSync(f.file, f.text + '수정');
  await pushVelog(f.article(), 'tester', f.dir, true, s.session);
  assert.equal(s.state.writes[1].input.meta.short_description, 'summary');
  assert.equal(s.state.writes[1].input.series_id, 'series-1');
  s.state.post.thumbnail = 'changed';
  await rejects(() => pushVelog(f.article(), 'tester', f.dir, true, s.session), 'VELOG_REMOTE_CONFLICT');
});
test('inline/reference Unicode image offsets, deduplication and immutable snapshots', async t => {
  const body = '한글😀\n![그림](image.png "제목")\n![다시][pic]\n\n[pic]: image.png "설명"\n\n```md\n![코드](image.png)\n```\n';
  const f = fixture(t, 'draft', body); const s = server(); const article = f.article();
  assert.equal(checkVelog(article).localImages, 1); assert.equal(velogImages(article).length, 2);
  writeFileSync(path.join(f.dir, 'image.png'), 'changed after validated read');
  await pushVelog(article, 'tester', f.dir, true, s.session);
  assert.equal(s.state.uploads.length, 1); assert.deepEqual(s.state.uploads[0].data, png);
  assert.match(s.state.post.body, /한글😀/); assert.match(s.state.post.body, /!\[다시\]\(<https:\/\/velog.velcdn.com\/images\/test\/image.png> "설명"\)/);
  assert.match(s.state.post.body, /```md\n!\[코드\]\(image.png\)/);
  assert.equal(readFileSync(f.file, 'utf8'), f.text);
  assert.throws(() => replaceVelogImages(article, velogImages(article), new Map()), { code: 'VELOG_IMAGE_FAILED' });
});
test('upload failure records uncertainty and never submits post', async t => {
  const f = fixture(t, 'draft', '![a](image.png)'); const s = server();
  s.client.upload = async () => { throw Error('private'); };
  await rejects(() => pushVelog(f.article(), 'tester', f.dir, true, s.session), 'VELOG_UNKNOWN_RESULT');
  assert.equal(s.state.writes.length, 0); assert.equal(f.state().status, 'unknown');
});
test('wrong owner or ID in readback is rejected', async t => {
  const f = fixture(t); const s = server();
  s.client.read = async () => ({ ...s.state.post, user: { ...user, id: 'other' } });
  await rejects(() => pushVelog(f.article(), 'tester', f.dir, true, s.session), 'VELOG_RESPONSE_INVALID');
});
test('update cannot silently drop preserved remote metadata', async t => {
  const f = fixture(t); const s = server();
  await pushVelog(f.article(), 'tester', f.dir, true, s.session);
  writeFileSync(f.file, f.text + '수정');
  const original = s.client.write;
  s.client.write = async (...args) => {
    await original(...args);
    s.state.post.short_description = 'unexpected server change';
    return structuredClone(s.state.post);
  };
  await rejects(() => pushVelog(f.article(), 'tester', f.dir, true, s.session), 'VELOG_READBACK_FAILED');
  assert.equal(f.state().status, 'unknown');
});
test('local journal rejects corruption/symlinks and exclusive lock prevents concurrent write', async t => {
  const f = fixture(t); mkdirSync(path.join(f.dir, '.postrail'), { mode: 0o755 });
  const file = journalPath(f.dir, 'tester', 'velog-test', true);
  await locked(file, async () => { await rejects(() => locked(file, async () => {}), 'VELOG_LOCKED'); });
  writeFileSync(file, '{}'); assert.throws(() => readJournal(file, 'tester', 'velog-test'), { code: 'VELOG_STORAGE_FAILED' });
  rmSync(file); symlinkSync(f.file, file);
  assert.throws(() => readJournal(file, 'tester', 'velog-test'), { code: 'VELOG_STORAGE_FAILED' });
});
test('login wrapper requires exact identity and passes explicit login mode', async () => {
  assert.equal((await loginVelog('tester', async (a, action, options) => {
    assert.equal(a, 'tester'); assert.deepEqual(options, { login: true }); return action({}, user);
  })).account, 'tester');
  await rejects(() => loginVelog('tester', async (_a, action) => action({}, { ...user, username: 'wrong' })), 'VELOG_ACCOUNT_MISMATCH');
});
test('manual login waits for ordinary Chrome exit with only the isolated profile and fixed URL', async () => {
  const browser = new EventEmitter(); let finished = false;
  const waiting = manualChromeLogin('/private/profile with spaces', { platform: 'darwin', spawnImpl: (binary, args, options) => {
    assert.equal(binary, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    assert.deepEqual(args, ['--user-data-dir=/private/profile with spaces', '--no-first-run', '--no-default-browser-check', 'https://velog.io/']);
    assert.deepEqual(options, { stdio: 'ignore', shell: false });
    return browser;
  } }).then(() => { finished = true; });
  await Promise.resolve(); assert.equal(finished, false);
  browser.emit('close', 0); await waiting; assert.equal(finished, true);
});
test('manual login rejects unsupported platforms and sanitizes process errors', async () => {
  await rejects(() => manualChromeLogin('/profile', { platform: 'win32' }), 'VELOG_LOGIN_UNSUPPORTED');
  for (const event of ['error', 'close']) {
    await assert.rejects(() => manualChromeLogin('/profile', { platform: 'darwin', spawnImpl: () => {
      const browser = new EventEmitter(); queueMicrotask(() => browser.emit(event, event === 'error' ? new Error('SECRET') : 1)); return browser;
    } }), error => error.code === 'VELOG_BROWSER_FAILED' && !error.message.includes('SECRET'));
  }
});
test('optional login diagnostics never contain URL, query code, fragment or raw status', () => {
  const safe = authDiagnostic('https://velog.io/email-login?code=DUMMY_SECRET#DUMMY_FRAGMENT', 200);
  assert.deepEqual(safe, { route: 'email-link', status: 200 });
  const exchange = authDiagnostic('https://v2.velog.io/api/v2/auth/code/DUMMY_PATH_SECRET?email=DUMMY_EMAIL', 403);
  assert.deepEqual(exchange, { route: 'email-exchange', status: 403 });
  assert.doesNotMatch(JSON.stringify([safe, exchange]), /DUMMY_|https|code|email=/);
  assert.deepEqual(authDiagnostic('https://v2.velog.io/api/v2/auth/code/DUMMY_PATH_SECRET', 'DUMMY_STATUS_SECRET'), { route: 'email-exchange', status: 'network-failed' });
  assert.equal(authDiagnostic('https://velog.io.evil.test/email-login?code=DUMMY_SECRET', 200), undefined);
  assert.equal(authDiagnostic('https://user:pass@velog.io/email-login', 200), undefined);
  assert.equal(authDiagnostic('https://velog.io/@someone/posts', 200), undefined);
});
test('login wrapper passes diagnostics only when explicitly requested', async () => {
  await loginVelog('tester', async (_a, action, options) => { assert.deepEqual(options, { login: true, diagnostics: true }); return action({}, user); }, { diagnostics: true });
});
function transport(value, status = 200) {
  const calls = []; let disposed = 0;
  const client = new VelogClient({ post: async (url, options) => {
    calls.push({ url, options }); return { status: () => status, body: async () => Buffer.from(JSON.stringify(value)), dispose: async () => { disposed++; } };
  } });
  return { client, calls, disposed: () => disposed };
}
test('partial GraphQL mutation errors retain only owned identity and remain unknown', async t => {
  const f = fixture(t); const m = transport({ data: { writePost: { id: 'partial-graphql', user } }, errors: [{ message: 'SECRET' }] });
  await assert.rejects(() => pushVelog(f.article(), 'tester', f.dir, true, async (_account, action) => action(m.client, user)), e => e.code === 'VELOG_GRAPHQL_FAILED' && !e.message.includes('SECRET'));
  assert.equal(f.state().postId, 'partial-graphql'); assert.equal(f.state().status, 'unknown'); assert.equal(m.calls.length, 1); assert.equal(m.disposed(), 1);
  await rejects(() => pushVelog(f.article(), 'tester', f.dir, true, () => assert.fail('must not reopen session')), 'VELOG_UNKNOWN_RESULT');
  assert.equal(m.calls.length, 1);
});
test('partial GraphQL update with a different ID preserves the existing identity', async t => {
  const f = fixture(t); const s = server(); await pushVelog(f.article(), 'tester', f.dir, true, s.session); writeFileSync(f.file, f.text + '수정');
  const m = transport({ data: { editPost: { id: 'different-id', user } }, errors: [{ message: 'SECRET' }] }); m.client.read = s.client.read;
  await rejects(() => pushVelog(f.article(), 'tester', f.dir, true, async (_account, action) => action(m.client, user)), 'VELOG_RESPONSE_INVALID');
  assert.equal(f.state().status, 'unknown'); assert.equal(f.state().postId, 'post-1'); assert.equal(m.calls.length, 1);
});
test('partial GraphQL errors with wrong owner cannot retain identity', async t => {
  const f = fixture(t); const m = transport({ data: { writePost: { id: 'bad-graphql', user: { ...user, id: 'other' } } }, errors: [{ message: 'SECRET' }] });
  await rejects(() => pushVelog(f.article(), 'tester', f.dir, true, async (_account, action) => action(m.client, user)), 'VELOG_RESPONSE_INVALID');
  assert.equal(f.state().postId, undefined); assert.equal(f.state().status, 'unknown'); assert.equal(m.calls.length, 1);
});
test('v3 transport has fixed endpoints, no redirects/retries, and input object schema', async () => {
  const f = transport({ data: { writePost: { id: 'id' }, editPost: { id: 'id' } } });
  await f.client.write({ title: 'title' }, false); await f.client.write({ id: 'id' }, true);
  for (const call of f.calls) {
    assert.equal(call.url, VELOG_GRAPHQL); assert.equal(call.options.maxRedirects, 0); assert.equal(call.options.maxRetries, 0);
    assert.match(call.options.data.query, /input: \$input/); assert.equal(call.options.headers.Origin, 'https://velog.io');
  }
  assert.match(f.calls[1].options.data.query, /EditPostInput/); assert.equal(f.disposed(), 2);
});
for (const [value, status, code] of [[{}, 401, 'VELOG_LOGIN_REQUIRED'], [{}, 302, 'VELOG_HTTP_FAILED'], [{ errors: [{ message: 'SECRET' }] }, 200, 'VELOG_GRAPHQL_FAILED']]) test(`transport sanitizes ${code}`, async () => {
  const f = transport(value, status);
  await assert.rejects(() => f.client.currentUser(), e => e.code === code && !e.message.includes('SECRET'));
  assert.equal(f.disposed(), 1); assert.equal(f.calls.length, 1);
});
for (const url of ['http://velog.velcdn.com/a', 'https://velcdn.com.evil.test/a', 'https://user:pass@velcdn.com/a']) test(`reject untrusted CDN ${url}`, async () => {
  const f = transport({ path: url }); await rejects(() => f.client.upload({ mime: 'image/png', data: png }, 'image.png'), 'VELOG_RESPONSE_INVALID');
});
test('upload request uses validated buffer multipart and accepts Velog CDN', async () => {
  const f = transport({ path: 'https://velog.velcdn.com/a.png' });
  assert.equal(await f.client.upload({ mime: 'image/png', data: png }, 'image.png'), 'https://velog.velcdn.com/a.png');
  assert.equal(f.calls[0].url, VELOG_UPLOAD); assert.deepEqual(f.calls[0].options.multipart.image.buffer, png);
});
test('built CLI offline commands and early guards never open browser or access network', t => {
  const f = fixture(t); const home = path.join(f.dir, 'home'); mkdirSync(home);
  const guard = path.join(f.dir, 'guard.cjs');
  writeFileSync(guard, `const deny=()=>{throw Error('NETWORK_FORBIDDEN')};global.fetch=deny;for(const n of ['http','https']){const m=require('node:'+n);m.request=deny;m.get=deny;}require('node:net').Socket.prototype.connect=deny;`);
  for (const [args, code] of [
    [['check', f.file], null], [['status', f.file, '--account', 'tester'], null],
    [['push', '/missing.md', '--account', 'tester'], 'VELOG_CONFIRM_REQUIRED'],
    [['push', f.file, '--confirm'], 'VELOG_ACCOUNT_REQUIRED'], [['check', f.file, '--token', 'secret'], 'INVALID_ARGUMENT'],
  ]) {
    const result = spawnSync(process.execPath, ['--require', guard, cli, 'velog', ...args, '--json'], { cwd: f.dir, env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 10000 });
    assert.ifError(result.error); assert.doesNotMatch(result.stdout + result.stderr, /NETWORK_FORBIDDEN|secret/);
    const value = JSON.parse(result.stdout); assert.equal(value.ok, code === null, result.stdout);
    if (code) assert.equal(value.error.code, code);
  }
  const planned = spawnSync(process.execPath, ['--require', guard, cli, 'plan', f.file, '--to', 'velog', '--json'], { cwd: f.dir, env: { ...process.env, HOME: home }, encoding: 'utf8', timeout: 10000 });
  assert.equal(planned.status, 0, planned.stderr);
  assert.deepEqual(JSON.parse(planned.stdout).targets[0].blockers, ['DESTINATIONS_REQUIRED', 'CONFIRM_REQUIRED']);
});
