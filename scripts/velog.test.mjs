import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadArticle, loadConfig } from '../src/core.js';
import { checkVelog, pushVelog, statusVelog, getVelog, loginVelog } from '../src/velog.js';
import { VelogClient, VELOG_GRAPHQL, VELOG_UPLOAD, authDiagnostic } from '../src/velog-client.js';
import { manualChromeLogin } from '../src/manual-chrome-login.js';
import { EventEmitter } from 'node:events';
import { journalPath, readJournal, saveJournal, locked } from '../src/velog-journal.js';
import { velogImages, replaceVelogImages } from '../src/velog-images.js';

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
