import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, readdirSync, statSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadArticle, loadConfig } from '../src/core.js';
import { BloggerClient, API, TOKEN_URL, BLOGGER_SCOPE, googleJson } from '../src/blogger-client.js';
import { callbackReceiver, pkce, loginAccount, withBloggerSession, credentialsPath } from '../src/blogger-auth.js';
import { checkBlogger, statusBlogger, getBlogger, pushBlogger, blogsBlogger } from '../src/blogger.js';
import { journalPath, readJournal, locked, savePrivate, readPrivate } from '../src/blogger-storage.js';

const nativeFetch = globalThis.fetch;
globalThis.fetch = () => { throw Error('UNMOCKED_NETWORK_FORBIDDEN'); };
const localFetch = url => { assert.equal(new URL(url).hostname, '127.0.0.1'); return nativeFetch(url); };
const account = 'test-account', blogId = '1234567890123456789', user = { id: '111222333' };
const clientConfig = { installed: { client_id: '123-test.apps.googleusercontent.com', client_secret: 'DUMMY_CLIENT_SECRET' } };
const grant = { access_token: 'DUMMY_ACCESS', refresh_token: 'DUMMY_REFRESH', token_type: 'Bearer', expires_in: 3600, scope: BLOGGER_SCOPE };
const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const rejects = (fn, code) => assert.rejects(fn, e => e.code === code);
const response = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
function fixture(t, visibility = 'draft', body = '한글 본문과 **강조**입니다.\n') {
  const dir = mkdtempSync(path.join(tmpdir(), 'postrail-blogger-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const home = path.join(dir, 'home'); mkdirSync(home, { mode: 0o700 });
  const file = path.join(dir, 'article.md');
  const text = `---\nid: blogger-test\ntitle: 블로거 검사\ntags: [개발, CLI]\nvisibility: ${visibility}\ntargets: [blogger]\n---\n${body}`;
  writeFileSync(file, text); const configFile = path.join(home, 'desktop.json'); writeFileSync(configFile, JSON.stringify(clientConfig), { mode: 0o600 });
  const article = () => loadArticle(file, loadConfig(path.join(dir, 'postrail.json'), false), ['blogger']);
  return { dir, home, file, text, configFile, article, state: () => statusBlogger(article(), account, blogId, dir).state };
}
function server() {
  const state = { writes: [], reads: [], transitions: [], targets: [], post: null, sequence: 0 };
  const client = {
    target: async (...args) => { state.targets.push(args); },
    read: async (blog, id) => { assert.equal(blog, blogId); state.reads.push(id); return structuredClone(state.post); },
    insert: async (blog, input) => { assert.equal(blog, blogId); state.writes.push({ input: structuredClone(input), create: true });
      state.post = { kind: 'blogger#post', id: '999888777', blog: { id: blog }, ...input, status: 'DRAFT', etag: `etag-${++state.sequence}` }; return structuredClone(state.post); },
    patch: async (blog, id, input, etag) => { assert.equal(blog, blogId); assert.equal(id, state.post.id); assert.equal(etag, state.post.etag);
      state.writes.push({ input: structuredClone(input), id, create: false }); Object.assign(state.post, input, { etag: `etag-${++state.sequence}` }); return structuredClone(state.post); },
    transition: async (blog, id, publish, etag) => { assert.equal(blog, blogId); assert.equal(id, state.post.id); assert.equal(etag, state.post.etag);
      state.transitions.push(publish); Object.assign(state.post, { status: publish ? 'LIVE' : 'DRAFT', etag: `etag-${++state.sequence}` }); return structuredClone(state.post); },
    blogs: async () => [{ blogId, name: 'Fixture blog' }],
  };
  const session = async (a, action) => { assert.equal(a, account); return action(client, user); };
  return { state, client, session };
}
for (const visibility of ['draft', 'public']) test(`${visibility}: creates draft first, validates readback and preserves source`, async t => {
  const f = fixture(t, visibility); const s = server();
  const result = await pushBlogger(f.article(), account, blogId, f.dir, true, s.session);
  assert.equal(result.readbackVerified, true); assert.equal(result.liveVerified, false);
  assert.deepEqual(s.state.transitions, visibility === 'public' ? [true] : []);
  assert.equal(f.state().status, 'succeeded'); assert.equal(readFileSync(f.file, 'utf8'), f.text);
  assert.equal((await getBlogger(f.article(), account, blogId, f.dir, s.session)).matchesLastSaved, true);
});
test('same content skips after remote check; edits PATCH same ID and preserve omitted fields', async t => {
  const f = fixture(t); const s = server();
  await pushBlogger(f.article(), account, blogId, f.dir, true, s.session);
  assert.equal((await pushBlogger(f.article(), account, blogId, f.dir, true, s.session)).skipped, true);
  writeFileSync(f.file, f.text + '추가');
  await pushBlogger(f.article(), account, blogId, f.dir, true, s.session);
  assert.equal(s.state.writes[1].id, '999888777'); assert.deepEqual(Object.keys(s.state.writes[1].input).sort(), ['content', 'labels', 'title']);
  s.state.post.etag = 'remote-change';
  await rejects(() => pushBlogger(f.article(), account, blogId, f.dir, true, s.session), 'BLOGGER_REMOTE_CONFLICT');
  assert.equal(s.state.writes.length, 2);
});
test('public→draft uses revert; draft→public uses publish on same ID', async t => {
  const f = fixture(t); const s = server(); await pushBlogger(f.article(), account, blogId, f.dir, true, s.session);
  writeFileSync(f.file, f.text.replace('visibility: draft', 'visibility: public'));
  await pushBlogger(f.article(), account, blogId, f.dir, true, s.session);
  writeFileSync(f.file, f.text); await pushBlogger(f.article(), account, blogId, f.dir, true, s.session);
  assert.deepEqual(s.state.transitions, [true, false]); assert.equal(s.state.post.id, '999888777');
});
test('private/local images are rejected before session or storage; remote images remain HTML', async t => {
  const f = fixture(t, 'private'); const noSession = () => { throw Error('MUST_NOT_OPEN'); };
  assert.deepEqual(checkBlogger(f.article()).blockers, ['BLOGGER_PRIVATE_UNSUPPORTED']);
  await rejects(() => pushBlogger(f.article(), account, blogId, f.dir, true, noSession), 'BLOGGER_PRIVATE_UNSUPPORTED');
  writeFileSync(path.join(f.dir, 'image.png'), Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=', 'base64'));
  writeFileSync(f.file, f.text.replace('visibility: private', 'visibility: draft') + '\n![a](image.png)');
  await rejects(() => pushBlogger(f.article(), account, blogId, f.dir, true, noSession), 'BLOGGER_LOCAL_IMAGE_UNSUPPORTED');
  assert.equal(readdirSync(f.dir).includes('.postrail'), false);
  writeFileSync(f.file, f.text.replace('visibility: private', 'visibility: draft') + '\n![a](https://images.example.test/a.png)');
  const s = server(); await pushBlogger(f.article(), account, blogId, f.dir, true, s.session);
  assert.match(s.state.post.content, /src="https:\/\/images.example.test\/a.png"/);
});
test('confirmation, account and blog ID are mandatory', async t => {
  const f = fixture(t); const noSession = () => { throw Error('MUST_NOT_OPEN'); };
  await rejects(() => pushBlogger(f.article(), account, blogId, f.dir, false, noSession), 'BLOGGER_CONFIRM_REQUIRED');
  await rejects(() => pushBlogger(f.article(), '../bad', blogId, f.dir, true, noSession), 'BLOGGER_ACCOUNT_REQUIRED');
  await rejects(() => pushBlogger(f.article(), account, 'https://evil.test', f.dir, true, noSession), 'BLOGGER_ID_REQUIRED');
});
test('response loss leaves unknown and blocks recreation before session', async t => {
  const f = fixture(t); const s = server(); s.client.insert = async () => { throw Error('SECRET'); };
  await rejects(() => pushBlogger(f.article(), account, blogId, f.dir, true, s.session), 'BLOGGER_UNKNOWN_RESULT');
  assert.equal(f.state().status, 'unknown');
  await rejects(() => pushBlogger(f.article(), account, blogId, f.dir, true, () => { throw Error('MUST_NOT_OPEN'); }), 'BLOGGER_UNKNOWN_RESULT');
});
test('failed readback retains ID and never publishes invalid draft', async t => {
  const f = fixture(t, 'public'); const s = server(); s.client.read = async () => ({ ...s.state.post, content: 'wrong content' });
  await rejects(() => pushBlogger(f.article(), account, blogId, f.dir, true, s.session), 'BLOGGER_READBACK_FAILED');
  assert.equal(f.state().postId, '999888777'); assert.equal(f.state().status, 'unknown'); assert.deepEqual(s.state.transitions, []);
});
test('identity-only mutation response retains ID before complete ADMIN readback fails', async t => {
  const f = fixture(t); const s = server(); const insert = s.client.insert;
  s.client.insert = async (...args) => { const p = await insert(...args); return { kind: p.kind, id: p.id, blog: p.blog }; };
  s.client.read = async () => { throw Error('readback lost'); };
  await rejects(() => pushBlogger(f.article(), account, blogId, f.dir, true, s.session), 'BLOGGER_UNKNOWN_RESULT');
  assert.equal(f.state().postId, '999888777'); assert.equal(f.state().status, 'unknown');
});
test('public transition failure retains same ID and does not recreate', async t => {
  const f = fixture(t, 'public'); const s = server(); s.client.transition = async () => { throw Error('connection lost'); };
  await rejects(() => pushBlogger(f.article(), account, blogId, f.dir, true, s.session), 'BLOGGER_UNKNOWN_RESULT');
  assert.equal(f.state().postId, '999888777'); assert.equal(f.state().status, 'unknown');
});
test('failed public→draft revert never sends new draft content to the public post', async t => {
  const f = fixture(t, 'public'); const s = server();
  await pushBlogger(f.article(), account, blogId, f.dir, true, s.session);
  const oldContent = s.state.post.content;
  writeFileSync(f.file, f.text.replace('visibility: public', 'visibility: draft') + '\nPRIVATE_NEW_DRAFT');
  s.client.transition = async () => { throw Error('revert failed'); };
  await rejects(() => pushBlogger(f.article(), account, blogId, f.dir, true, s.session), 'BLOGGER_UNKNOWN_RESULT');
  assert.equal(s.state.writes.length, 1); assert.equal(s.state.post.content, oldContent); assert.equal(f.state().status, 'unknown');
});
test('unexpected publication on draft creation is rejected', async t => {
  const f = fixture(t); const s = server(); const original = s.client.insert;
  s.client.insert = async (...args) => { const p = await original(...args); s.state.post.status = 'LIVE'; return p; };
  await rejects(() => pushBlogger(f.article(), account, blogId, f.dir, true, s.session), 'BLOGGER_READBACK_FAILED');
});
test('wrong account or returned blog/post ID fails closed', async t => {
  const f = fixture(t); const s = server(); await pushBlogger(f.article(), account, blogId, f.dir, true, s.session);
  await rejects(() => getBlogger(f.article(), account, blogId, f.dir, async (_a, action) => action(s.client, { id: '555' })), 'BLOGGER_ACCOUNT_MISMATCH');
  s.state.post.blog.id = '111';
  await rejects(() => getBlogger(f.article(), account, blogId, f.dir, s.session), 'BLOGGER_RESPONSE_INVALID');
});
test('journal rejects symlinks/corruption, locks concurrent writes and excludes secrets', async t => {
  const f = fixture(t); const s = server(); await pushBlogger(f.article(), account, blogId, f.dir, true, s.session);
  const file = journalPath(f.dir, account, blogId, f.article().meta.id, false);
  assert.doesNotMatch(readFileSync(file, 'utf8'), /DUMMY_|client_secret|content":|access_token/);
  await locked(file, async () => { await rejects(() => locked(file, async () => {}), 'BLOGGER_LOCKED'); });
  writeFileSync(file, '{}'); assert.throws(() => readJournal(file, account, blogId, f.article().meta.id), { code: 'BLOGGER_STORAGE_FAILED' });
  rmSync(file); symlinkSync(f.file, file); assert.throws(() => readPrivate(file), { code: 'BLOGGER_STORAGE_PERMISSIONS' });
});
test('PKCE uses S256 and independently random state/verifier', () => {
  const p = pkce(); assert.equal(p.challenge, createHash('sha256').update(p.verifier).digest('base64url'));
  assert.notEqual(p.state, p.verifier); assert.notEqual(pkce().state, p.state); assert.equal(p.verifier.length, 43);
});
test('loopback callback rejects wrong/Unicode/repeated state, accepts one exact code, blocks replay', async () => {
  const p = pkce(), receiver = await callbackReceiver(p.state, 2000);
  try {
    for (const state of ['wrong', '가'.repeat(43)]) {
      const bad = await localFetch(receiver.redirectUri + '?' + new URLSearchParams({ state, code: 'DUMMY_CODE' })); assert.equal(bad.status, 400); await bad.text();
    }
    const bad = await localFetch(receiver.redirectUri + `?state=${p.state}&state=${p.state}&code=DUMMY_CODE`); assert.equal(bad.status, 400); await bad.text();
    const good = await localFetch(receiver.redirectUri + '?' + new URLSearchParams({ state: p.state, code: 'DUMMY_CODE' })); assert.equal(good.status, 200); assert.doesNotMatch(await good.text(), /DUMMY_CODE/);
    assert.equal(await receiver.wait, 'DUMMY_CODE');
    const replay = await localFetch(receiver.redirectUri + '?' + new URLSearchParams({ state: p.state, code: 'DUMMY_CODE' })); assert.equal(replay.status, 400); await replay.text();
  } finally { await receiver.close(); }
});
test('loopback callback denial and timeout are bounded', async () => {
  const p = pkce(), denied = await callbackReceiver(p.state, 1000);
  try { const r = await localFetch(denied.redirectUri + '?' + new URLSearchParams({ state: p.state, error: 'access_denied' })); await r.text(); await rejects(() => denied.wait, 'BLOGGER_OAUTH_DENIED'); }
  finally { await denied.close(); }
  const timed = await callbackReceiver(p.state, 20); try { await rejects(() => timed.wait, 'BLOGGER_OAUTH_TIMEOUT'); } finally { await timed.close(); }
});
async function mockLogin(f, userId = user.id, extra = {}) {
  let auth;
  return loginAccount(account, f.configFile, { home: f.home, timeout: 2000,
    openBrowser: async url => { auth = new URL(url); assert.equal(auth.origin, 'https://accounts.google.com'); assert.equal(auth.searchParams.get('scope'), BLOGGER_SCOPE); assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
      const r = await localFetch(auth.searchParams.get('redirect_uri') + '?' + new URLSearchParams({ state: auth.searchParams.get('state'), code: 'DUMMY_CODE' })); await r.text(); },
    fetchImpl: async (url, options) => {
      if (url === TOKEN_URL) { const body = new URLSearchParams(options.body); assert.equal(body.get('code'), 'DUMMY_CODE'); assert.equal(createHash('sha256').update(body.get('code_verifier')).digest('base64url'), auth.searchParams.get('code_challenge')); assert.equal(body.get('redirect_uri'), auth.searchParams.get('redirect_uri')); return response(grant); }
      assert.equal(url, API + '/users/self'); return response({ kind: 'blogger#user', id: userId });
    }, ...extra });
}
test('OAuth grant flow binds user ID, stores only in private home and returns no secrets', async t => {
  const f = fixture(t); const result = await mockLogin(f);
  assert.doesNotMatch(JSON.stringify(result), /DUMMY_|secret|token/i);
  const file = credentialsPath(account, f.home); const stored = readPrivate(file);
  assert.equal(stored.userId, user.id); assert.equal(stored.refreshToken, grant.refresh_token);
  if (process.platform !== 'win32') assert.equal(statSync(file).mode & 0o777, 0o600);
  assert.equal(readdirSync(f.dir).includes('.postrail'), false);
});
test('reauthorization cannot silently bind existing account alias to another user', async t => {
  const f = fixture(t); await mockLogin(f); await rejects(() => mockLogin(f, '987654321'), 'BLOGGER_ACCOUNT_MISMATCH');
  assert.equal(readPrivate(credentialsPath(account, f.home)).userId, user.id);
});
test('OAuth config must be installed/Desktop, not arbitrary endpoints or web flow', async t => {
  const f = fixture(t); writeFileSync(f.configFile, JSON.stringify({ web: clientConfig.installed }));
  await rejects(() => loginAccount(account, f.configFile, { home: f.home }), 'BLOGGER_CLIENT_INVALID');
});
test('browser failure closes callback and never reads or sends grant', async t => {
  const f = fixture(t);
  await rejects(() => mockLogin(f, user.id, { openBrowser: async () => { throw Error('PRIVATE_BROWSER_ERROR'); }, fetchImpl: async () => { throw Error('MUST_NOT_CALL'); } }), 'BLOGGER_OAUTH_FAILED');
});
test('expired grant refreshes before action and validates bound user; no automatic API retry', async t => {
  const f = fixture(t); await mockLogin(f); const file = credentialsPath(account, f.home); savePrivate(file, { ...readPrivate(file), expiresAt: 0 });
  let refreshes = 0, actions = 0;
  const fetchImpl = async (url, options) => { if (url === TOKEN_URL) { refreshes++; assert.equal(new URLSearchParams(options.body).get('grant_type'), 'refresh_token'); return response({ ...grant, access_token: 'DUMMY_NEW_ACCESS' }); }
    assert.equal(url, API + '/users/self'); return response({ kind: 'blogger#user', id: user.id }); };
  await withBloggerSession(account, async () => { actions++; }, { home: f.home, fetchImpl });
  assert.equal(refreshes, 1); assert.equal(actions, 1); assert.equal(readPrivate(file).accessToken, 'DUMMY_NEW_ACCESS');
  await rejects(() => withBloggerSession(account, async () => { throw Error('MUST_NOT_CALL'); }, { home: f.home, fetchImpl: async () => response({ kind: 'blogger#user', id: '555' }) }), 'BLOGGER_ACCOUNT_MISMATCH');
});
test('Google transport fixed API routes, draft insert, PATCH If-Match and ADMIN target', async () => {
  const calls = []; const c = new BloggerClient('DUMMY_ACCESS', async (url, options) => { calls.push({ url, options }); return response({}); });
  await c.insert(blogId, { title: 't' }); await c.patch(blogId, '999', { title: 'edit' }, 'etag-1'); await c.transition(blogId, '999', true, 'etag-2');
  assert.equal(calls[0].url, `${API}/blogs/${blogId}/posts?isDraft=true&fetchBody=true`);
  assert.equal(calls[1].options.method, 'PATCH'); assert.equal(calls[1].options.headers['If-Match'], 'etag-1');
  assert.equal(calls[2].url, `${API}/blogs/${blogId}/posts/999/publish`);
  assert(calls.every(c => c.options.redirect === 'error'));
  const right = new BloggerClient('DUMMY_ACCESS', async () => response({ blog: { id: blogId }, blog_user_info: { blogId, userId: user.id, role: 'ADMIN', hasAdminAccess: true } })); await right.target(blogId, user.id);
  const wrong = new BloggerClient('DUMMY_ACCESS', async () => response({ blog: { id: blogId }, blog_user_info: { blogId, userId: user.id, role: 'READER', hasAdminAccess: false } })); await rejects(() => wrong.target(blogId, user.id), 'BLOGGER_BLOG_MISMATCH');
});
for (const [status, code] of [[401, 'BLOGGER_LOGIN_REQUIRED'], [403, 'BLOGGER_PERMISSION_DENIED'], [412, 'BLOGGER_REMOTE_CONFLICT'], [500, 'BLOGGER_HTTP_FAILED']]) test(`Google ${status} is sanitized with no retry`, async () => {
  let calls = 0; await assert.rejects(() => googleJson(API + '/users/self', {}, async () => { calls++; return response({ error: 'SERVER_SECRET' }, status); }), e => e.code === code && !e.message.includes('SERVER_SECRET')); assert.equal(calls, 1);
});
test('foreign endpoints and oversized Google responses are rejected', async () => {
  await rejects(() => googleJson('https://evil.test/token', {}, () => { throw Error('MUST_NOT_CALL'); }), 'BLOGGER_REQUEST_INVALID');
  await rejects(() => googleJson(API + '/users/self', {}, async () => new Response('a'.repeat(8 * 1024 * 1024 + 1))), 'BLOGGER_RESPONSE_INVALID');
});
test('blog list command returns only intended names/IDs, not credentials', async () => {
  const s = server(); assert.deepEqual((await blogsBlogger(account, s.session)).blogs, [{ blogId, name: 'Fixture blog' }]);
});
test('fetchUserInfo lists ADMIN blogs from blogUserInfos even when items is omitted', async () => {
  const client = new BloggerClient('DUMMY_ACCESS', async () => response({ kind: 'blogger#blogList', blogUserInfos: [
    { blog: { id: blogId, name: 'Fixture blog' }, blog_user_info: { blogId, userId: user.id, role: 'ADMIN' } },
  ] }));
  assert.deepEqual(await client.blogs(), [{ blogId, name: 'Fixture blog' }]);
  const wrong = new BloggerClient('DUMMY_ACCESS', async () => response({ blogUserInfos: [
    { blog: { id: blogId, name: 'Fixture blog' }, blog_user_info: { blogId, role: 'READER' } },
  ] }));
  await rejects(() => wrong.blogs(), 'BLOGGER_BLOG_MISMATCH');
  for (const blogUserInfos of [null, [null]]) {
    const invalid = new BloggerClient('DUMMY_ACCESS', async () => response({ blogUserInfos }));
    await rejects(() => invalid.blogs(), 'BLOGGER_RESPONSE_INVALID');
  }
  const mismatch = new BloggerClient('DUMMY_ACCESS', async () => response({ blogUserInfos: [
    { blog: { id: blogId, name: 'Fixture blog' }, blog_user_info: { blogId: '999', role: 'ADMIN' } },
  ] }));
  await rejects(() => mismatch.blogs(), 'BLOGGER_BLOG_MISMATCH');
});
test('built CLI offline commands and early guards cannot open network/browser', t => {
  const f = fixture(t); const guard = path.join(f.dir, 'guard.cjs'); writeFileSync(guard, `const deny=()=>{throw Error('NETWORK_FORBIDDEN')};global.fetch=deny;for(const n of ['http','https']){const m=require('node:'+n);m.request=deny;m.get=deny;}require('node:net').Socket.prototype.connect=deny;`);
  const initial = readdirSync(f.home);
  for (const [args, code] of [
    [['check', f.file], null], [['status', f.file, '--account', account, '--blog-id', blogId], null],
    [['push', '/missing.md', '--account', account, '--blog-id', blogId], 'BLOGGER_CONFIRM_REQUIRED'],
    [['push', f.file, '--confirm'], 'BLOGGER_ACCOUNT_REQUIRED'], [['check', f.file, '--token', 'SECRET'], 'INVALID_ARGUMENT'],
    [['login', '--account', account], 'INVALID_ARGUMENT'],
  ]) {
    const r = spawnSync(process.execPath, ['--require', guard, cli, 'blogger', ...args, '--json'], { cwd: f.dir, env: { ...process.env, HOME: f.home }, encoding: 'utf8', timeout: 10000 });
    assert.ifError(r.error); assert.doesNotMatch(r.stdout + r.stderr, /NETWORK_FORBIDDEN|SECRET/); const value = JSON.parse(r.stdout); assert.equal(value.ok, code === null, r.stdout); if (code) assert.equal(value.error.code, code);
  }
  const login = spawnSync(process.execPath, ['--require', guard, cli, 'blogger', 'login', '--account', account], { cwd: f.dir, env: { ...process.env, HOME: f.home }, encoding: 'utf8', timeout: 10000 });
  assert.ifError(login.error); assert.equal(login.status, 1); assert.match(login.stderr, /^BLOGGER_CLIENT_REQUIRED:/); assert.equal(login.stdout, '');
  assert.deepEqual(readdirSync(f.home), initial);
});
