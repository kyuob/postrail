import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { loadArticle, contentHashForTargets } from '../src/core.js';
import { inspectTistory, reconcileTistory, inspectBlogger, reconcileBlogger } from '../src/platform-recovery.js';
import { journalPath as tPath, readJournal as tRead, saveJournal as tSave, hash } from '../src/tistory-storage.js';
import { journalPath as bPath, readJournal as bRead, savePrivate as bSave } from '../src/blogger-storage.js';
import { tistoryTarget } from '../src/tistory-client.js';
import { renderTistory, postFromConfig } from '../src/tistory-format.js';
import { pushTistory } from '../src/tistory.js';
import { pushBlogger } from '../src/blogger.js';
import { fingerprint } from '../src/recovery-journal.js';
import { verifyImageBytes } from '../src/recovery-images.js';

const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/a9sAAAAASUVORK5CYII=', 'base64');
const target = tistoryTarget('test-blog', '12345'), account = 'tester', blogId = '12345', userId = '56789';
const config = { targets: ['velog', 'tistory', 'blogger'], visibility: 'public' };
const ref = 'kage@aaa/bbb/img.png?credential=test&amp;expires=123&amp;signature=test';
function fixture(t, platform, { local = false, status = 'unknown', visibility = 'public' } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'postrail-recovery-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'article.md');
  let source = `---\nid: recover\ntitle: Recover safely\ntags: [CLI]\nvisibility: ${visibility}\n---\nHello recovery.\n\n![remote](https://images.example.test/a.png)`;
  if (local) { writeFileSync(path.join(dir, 'image.png'), png); source += '\n\n![local](image.png)\n\n![again](image.png)'; }
  writeFileSync(file, source);
  const article = (selected) => loadArticle(file, config, selected);
  const a = article();
  let post;
  if (platform === 'tistory') {
    const e = { id: '77', title: a.meta.title, content: renderTistory(a, new Map(local ? [['image.png', ref]] : [])), visibility: visibility === 'private' ? 0 : 20, categoryId: 7, tags: 'CLI', slogan: 'keep-slug', uselessMarginForEntry: 1, cclCommercial: 0, cclDerive: 0 };
    post = postFromConfig({ blog: { domain: target.host, blogSettings: { blogId: target.blogId } }, entry: e }, target, '77');
  } else post = { kind: 'blogger#post', id: '77', blog: { id: blogId }, title: a.meta.title,
    content: a.md.renderer.render(a.tokens, a.md.options, {}), status: visibility === 'draft' ? 'DRAFT' : 'LIVE', labels: ['CLI'], etag: 'v1' };
  const journal = platform === 'tistory' ? tPath(dir, target, a.meta.id, true) : bPath(dir, account, blogId, a.meta.id, true);
  const initial = { version: 1, articleId: a.meta.id, contentHash: a.contentHash, status, postId: '77',
    ...(platform === 'tistory' ? { blog: target.blog, blogId: target.blogId } : { account, blogId, userId }) };
  const save = state => (platform === 'tistory' ? tSave : bSave)(journal, state);
  if (status === 'succeeded') initial.remoteHash = platform === 'tistory' ? hash(post.editor) : 'a'.repeat(64);
  save(initial);
  const state = () => platform === 'tistory' ? tRead(journal, target, 'recover') : bRead(journal, account, blogId, 'recover');
  let reads = 0, requests = 0, onRead;
  const client = { async read(...args) { assert.equal(args.at(-1), '77'); reads++; onRead?.(); return structuredClone(post); },
    async target(id, owner) { assert.equal(id, blogId); assert.equal(owner, userId); },
    write() { assert.fail('no remote write'); }, patch() { assert.fail('no patch'); }, insert() { assert.fail('no insert'); }, upload() { assert.fail('no upload'); }, transition() { assert.fail('no transition'); } };
  const session = async (_identity, action) => action(client, platform === 'tistory' ? target : { id: userId });
  const request = async (_url, options) => { requests++; assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit'); return new Response(png); };
  return { dir, file, article, journal, post, save, state, initial, session, request, counts: () => ({ reads, requests }),
    onRead(fn) { onRead = fn; },
    inspect(a = article(), s = session, req = request) { return platform === 'tistory' ? inspectTistory(a, target, dir, s, req) : inspectBlogger(a, account, blogId, dir, s); },
    reconcile(options, a = article(), s = session, req = request) { return platform === 'tistory' ? reconcileTistory(a, target, dir, options, s, req) : reconcileBlogger(a, account, blogId, dir, options, s); },
    push() { return platform === 'tistory' ? pushTistory(article(['tistory']), target, dir, true, session) : pushBlogger(article(['blogger']), account, blogId, dir, true, session); } };
}
for (const platform of ['tistory', 'blogger']) {
  const prefix = platform.toUpperCase();
  test(`${platform}: inspect preserves bytes; confirmed reconciliation backs up and skips future unchanged push`, async t => {
    const f = fixture(t, platform, { visibility: platform === 'tistory' ? 'private' : 'draft' });
    const bytes = readFileSync(f.journal), names = readdirSync(path.dirname(f.journal));
    const r = await f.inspect(); assert.equal(r.canReconcile, true); assert.deepEqual(readFileSync(f.journal), bytes); assert.deepEqual(readdirSync(path.dirname(f.journal)), names);
    assert.deepEqual(Object.values(r.comparisons), [true, true, true, true, true, true]);
    const result = await f.reconcile({ confirmed: true, reviewHash: r.reviewHash }); assert.equal(result.remoteWritten, false);
    assert.deepEqual(readFileSync(f.journal + `.backup-${fingerprint(bytes)}.json`), bytes);
    assert.equal(f.state().contentHash, f.initial.contentHash); assert.equal(f.state().recoveredContentHash, contentHashForTargets(f.article(), [platform]));
    assert.equal((await f.push()).skipped, true);
    f.post.title = 'external edit'; if (platform === 'tistory') f.post.editor.title = f.post.title;
    await assert.rejects(() => f.push(), { code: `${prefix}_REMOTE_CONFLICT` });
  });
  test(`${platform}: confirmation, review hash and explicit tag acceptance are required`, async t => {
    const f = fixture(t, platform); const bytes = readFileSync(f.journal);
    await assert.rejects(() => f.reconcile({}), { code: `${prefix}_RECOVERY_CONFIRM_REQUIRED` });
    await assert.rejects(() => f.reconcile({ confirmed: true }), { code: `${prefix}_RECOVERY_REVIEW_REQUIRED` }); assert.equal(f.counts().reads, 0);
    if (platform === 'tistory') { f.post.tags = ['different']; f.post.editor.tags = 'different'; } else f.post.labels = ['different'];
    const r = await f.inspect(); assert.equal(r.requiresTagAcceptance, true); assert.equal(r.canReconcile, true);
    await assert.rejects(() => f.reconcile({ confirmed: true, reviewHash: r.reviewHash }), { code: `${prefix}_RECOVERY_TAG_ACCEPT_REQUIRED` }); assert.deepEqual(readFileSync(f.journal), bytes);
    assert.equal((await f.reconcile({ confirmed: true, reviewHash: r.reviewHash, acceptTags: true })).acceptedTags, true);
  });
  test(`${platform}: source/title/body/privacy differences cannot be accepted as tag differences`, async t => {
    for (const field of ['source', 'title', 'body', 'visibility']) {
      const f = fixture(t, platform); const bytes = readFileSync(f.journal);
      if (field === 'source') writeFileSync(f.file, readFileSync(f.file, 'utf8').replace('Hello recovery.', 'New source.'));
      if (field === 'title') f.post.title = 'changed';
      if (field === 'body') f.post.content += '<p>changed</p>';
      if (field === 'visibility') { if (platform === 'tistory') f.post.visibility = 0; else f.post.status = 'DRAFT'; }
      const r = await f.inspect(); assert.equal(r.canReconcile, false);
      await assert.rejects(() => f.reconcile({ confirmed: true, reviewHash: r.reviewHash, acceptTags: true }), { code: `${prefix}_RECOVERY_MISMATCH` }); assert.deepEqual(readFileSync(f.journal), bytes);
    }
  });
  test(`${platform}: remote, local journal and source changes invalidate review`, async t => {
    for (const field of ['remote', 'journal', 'source']) {
      const f = fixture(t, platform); const r = await f.inspect();
      if (field === 'remote') { if (platform === 'tistory') f.post.editor.categoryId++; else f.post.etag = 'v2'; }
      if (field === 'journal') f.save({ ...f.initial, contentHash: 'b'.repeat(64) });
      if (field === 'source') writeFileSync(f.file, readFileSync(f.file, 'utf8').replace('Hello recovery.', 'Changed.'));
      await assert.rejects(() => f.reconcile({ confirmed: true, reviewHash: r.reviewHash }), { code: `${prefix}_RECOVERY_STALE` });
      assert.notEqual(f.state().status, 'succeeded');
    }
  });
  test(`${platform}: missing ID, wrong returned ID, successful state and existing lock are blocked`, async t => {
    const f = fixture(t, platform); f.save({ ...f.initial, postId: undefined }); await assert.rejects(() => f.inspect(), { code: `${prefix}_NO_REMOTE_ID` });
    f.save(f.initial); f.post.id = '78'; await assert.rejects(() => f.inspect(), { code: `${prefix}_RESPONSE_INVALID` }); f.post.id = '77';
    const r = await f.inspect(); writeFileSync(f.journal + '.lock', 'held');
    await assert.rejects(() => f.reconcile({ confirmed: true, reviewHash: r.reviewHash }), { code: `${prefix}_LOCKED` });
    const s = fixture(t, platform, { status: 'succeeded' }); const inspected = await s.inspect(); assert.equal(inspected.canReconcile, false);
    await assert.rejects(() => s.reconcile({ confirmed: true, reviewHash: inspected.reviewHash }), { code: `${prefix}_RECOVERY_STATE_INVALID` });
  });
  test(`${platform}: unsafe backup and concurrent journal change preserve unresolved state`, async t => {
    const f = fixture(t, platform); const bytes = readFileSync(f.journal), r = await f.inspect();
    writeFileSync(f.journal + `.backup-${fingerprint(bytes)}.json`, 'invalid', { mode: 0o600 });
    await assert.rejects(() => f.reconcile({ confirmed: true, reviewHash: r.reviewHash }), { code: `${prefix}_RECOVERY_BACKUP_FAILED` }); assert.deepEqual(readFileSync(f.journal), bytes);
    const g = fixture(t, platform), check = await g.inspect(); g.onRead(() => g.save({ ...g.initial, contentHash: 'c'.repeat(64) }));
    await assert.rejects(() => g.reconcile({ confirmed: true, reviewHash: check.reviewHash }), { code: `${prefix}_RECOVERY_STALE` }); assert.equal(g.state().status, 'unknown');
  });
  test(`${platform}: pending state supported and malformed recovered hashes rejected`, async t => {
    const f = fixture(t, platform, { status: 'pending' }); const r = await f.inspect(); assert.equal(r.canReconcile, true);
    await f.reconcile({ confirmed: true, reviewHash: r.reviewHash });
    f.save({ ...f.state(), recoveredContentHash: 'invalid' }); assert.throws(() => f.state(), { code: `${prefix}_STORAGE_FAILED` });
  });
}
test('Tistory local images verify trusted CDN bytes after whole-body comparison, including repeated paths', async t => {
  const f = fixture(t, 'tistory', { local: true }); const r = await f.inspect(); assert.equal(r.canReconcile, true); assert.equal(f.counts().requests, 1);
  const badBytes = async () => new Response(Buffer.from('wrong'));
  assert.equal((await f.inspect(undefined, undefined, badBytes)).canReconcile, false);
  f.post.content += '<p>unrelated change</p>'; const calls = f.counts().requests;
  assert.equal((await f.inspect()).canReconcile, false); assert.equal(f.counts().requests, calls);
});
test('Tistory invalid attachment references never trigger CDN requests', async t => {
  for (const replacement of ['kage@../escape/img.png?x=1', 'https://evil.test/a.png', 'kage@aaa/bbb/img.png?x=<bad>']) {
    const f = fixture(t, 'tistory', { local: true }); f.post.content = f.post.content.replaceAll(ref, replacement);
    assert.equal((await f.inspect()).canReconcile, false); assert.equal(f.counts().requests, 0);
  }
});
test('Blogger requires correct user and blog identity', async t => {
  const f = fixture(t, 'blogger');
  await assert.rejects(() => f.inspect(undefined, (_a, action) => action({}, { id: '999' })), { code: 'BLOGGER_ACCOUNT_MISMATCH' });
  f.post.blog.id = '999'; await assert.rejects(() => f.inspect(), { code: 'BLOGGER_RESPONSE_INVALID' });
});
test('Tistory requires canonical authenticated blog identity', async t => {
  const f = fixture(t, 'tistory');
  await assert.rejects(() => f.inspect(undefined, (_a, action) => action({}, { ...target, blogId: '999' })), { code: 'TISTORY_BLOG_MISMATCH' });
});
test('built recovery CLI validates review and confirmation before authentication', t => {
  const dir = mkdtempSync(path.join(tmpdir(), 'postrail-recovery-cli-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const cli = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
  for (const [platform, identity] of [['tistory', ['--blog', 'test-blog', '--blog-id', '12345']], ['blogger', ['--account', 'tester', '--blog-id', '12345']]]) {
    for (const confirm of [[], ['--confirm']]) {
      const out = spawnSync(process.execPath, [cli, platform, 'reconcile', 'missing.md', ...identity, ...confirm, '--json'], { cwd: dir, encoding: 'utf8' });
      assert.equal(out.status, 1); assert.equal(JSON.parse(out.stdout).error.code, `${platform.toUpperCase()}_RECOVERY_${confirm.length ? 'REVIEW' : 'CONFIRM'}_REQUIRED`);
    }
  }
  assert.deepEqual(readdirSync(dir), []);
});
test('new image byte verifier rejects redirects, oversized streams, changes and timeouts', async () => {
  assert.equal(await verifyImageBytes('https://example.test/image', png, async () => new Response(png)), true);
  for (const response of [new Response(png, { status: 302 }), new Response(Buffer.concat([png, Buffer.from('extra')])), new Response(Buffer.alloc(png.length))]) {
    assert.equal(await verifyImageBytes('https://example.test/image', png, async (_url, options) => {
      assert.equal(options.redirect, 'error'); assert.equal(options.credentials, 'omit'); assert(options.signal instanceof AbortSignal); return response;
    }), false);
  }
  assert.equal(await verifyImageBytes('https://example.test/image', png, async () => { throw new DOMException('Timed out', 'TimeoutError'); }), false);
});
test('backup open/write/fsync failures cannot promote either platform journal', async t => {
  for (const platform of ['tistory', 'blogger']) for (const method of ['openSync', 'writeFileSync', 'fsyncSync']) {
    const f = fixture(t, platform), bytes = readFileSync(f.journal), r = await f.inspect();
    const original = fs[method];
    fs[method] = (...args) => {
      if (method !== 'openSync' || String(args[0]).includes('.backup-')) throw Object.assign(new Error('Synthetic I/O fault'), { code: 'EIO' });
      return original(...args);
    };
    syncBuiltinESMExports();
    try { await assert.rejects(() => f.reconcile({ confirmed: true, reviewHash: r.reviewHash }), { code: `${platform.toUpperCase()}_RECOVERY_BACKUP_FAILED` }); }
    finally { fs[method] = original; syncBuiltinESMExports(); }
    assert.deepEqual(readFileSync(f.journal), bytes); assert.equal(f.state().status, 'unknown');
  }
});
