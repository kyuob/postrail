import { lstatSync, openSync, closeSync, writeFileSync, fsyncSync } from 'node:fs';
import path from 'node:path';
import { fromMarkdown } from 'mdast-util-from-markdown';
import { fail, readBounded, contentHashForTargets } from './core.js';
import { digest, journalPath, readJournal, saveJournal, locked } from './velog-journal.js';
import { velogAccount, withVelogSession } from './velog-client.js';
import { validateVelogUser, validateVelogPost, velogRemoteHash, velogVisibilityFlags } from './velog.js';
import { velogImages, replaceVelogImages } from './velog-images.js';
import { equivalentTags, distinctTagIdentities } from './tags.js';

function snapshot(file, account, articleId) {
  const state = readJournal(file, account, articleId);
  if (!state?.postId) fail('VELOG_NO_REMOTE_ID', 'No saved remote ID is available. Inspect the service management screen; do not recreate the post.');
  const bytes = readBounded(file, 64 * 1024, 'VELOG_STORAGE_FAILED');
  let parsed; try { parsed = JSON.parse(bytes); } catch { fail('VELOG_STORAGE_FAILED', 'Cannot read the local journal.'); }
  if (digest(parsed) !== digest(state)) fail('VELOG_RECOVERY_STALE', 'The local journal changed. Inspect again before reconciliation.');
  return { state, bytes, hash: digest(bytes) };
}
function trustedImage(raw) {
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' && url.hostname === 'velog.velcdn.com' && !url.port && !url.username && !url.password && !url.hash;
  } catch { return false; }
}
async function downloadImage(url, limit, request = fetch) {
  let reader;
  try {
    const response = await request(url, { redirect: 'error', credentials: 'omit', signal: AbortSignal.timeout(5000) });
    reader = response.body?.getReader();
    if (response.status !== 200 || !reader) throw Error('Unverified image');
    const chunks = []; let bytes = 0;
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength; if (bytes > limit || bytes > 5 * 1024 * 1024) throw Error('Oversized image');
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } catch { fail('VELOG_RECOVERY_IMAGE_FAILED', 'A local image could not be verified against its saved CDN copy.'); }
  finally { if (reader) await reader.cancel().catch(() => {}); }
}
function imagesIn(body) {
  const nodes = [];
  function walk(n) { if (n.type === 'image' || n.type === 'imageReference') nodes.push(n); for (const c of n.children ?? []) walk(c); }
  walk(fromMarkdown(body)); return nodes;
}
async function compareBody(article, post, request) {
  const refs = velogImages(article), local = new Map(refs.map(r => [r.start, r]));
  const source = imagesIn(article.body), actual = imagesIn(post.body), urls = new Map();
  const unverified = { matches: false, localImages: new Set(refs.map(r => r.source)).size, imagesVerified: refs.length === 0 };
  if (source.length !== actual.length) return unverified;
  for (const [index, node] of source.entries()) {
    const ref = local.get(node.position.start.offset); if (!ref) continue;
    const url = actual[index].url;
    if (!trustedImage(url) || urls.has(ref.source) && urls.get(ref.source) !== url) return unverified;
    urls.set(ref.source, url);
  }
  // Do not fetch anything until both parser agreement and the entire exact body match.
  if (post.body !== replaceVelogImages(article, refs, urls)) return unverified;
  try {
    for (const [source, url] of urls) {
      const expected = article.images.get(source).data;
      const bytes = await downloadImage(url, expected.length, request);
      if (digest(bytes) !== digest(expected)) return unverified;
    }
  } catch { return unverified; }
  return { matches: true, localImages: urls.size, imagesVerified: true };
}
async function inspectSnapshot(article, account, snap, client, user, request) {
  validateVelogUser(user, account);
  if (snap.state.ownerId !== user.id) fail('VELOG_ACCOUNT_MISMATCH', 'The journal belongs to another Velog author.');
  const post = validateVelogPost(await client.read(snap.state.postId), user);
  if (post.id !== snap.state.postId) fail('VELOG_RESPONSE_INVALID', 'Velog returned a different saved post ID.');
  const sourceMatchesJournal = [article.contentHash, contentHashForTargets(article, ['velog'])].includes(snap.state.contentHash);
  const body = await compareBody(article, post, request);
  const visibility = post.is_temp ? 'draft' : post.is_private ? 'private' : 'public';
  const intendedFlags = velogVisibilityFlags(article), actualFlags = { is_temp: post.is_temp, is_private: post.is_private };
  const comparisons = { source: sourceMatchesJournal, title: post.title === article.meta.title, body: body.matches,
    tags: equivalentTags(post.tags, article.meta.tags), visibility: post.is_temp === intendedFlags.is_temp && post.is_private === intendedFlags.is_private, images: body.imagesVerified };
  const canReconcile = ['unknown', 'pending'].includes(snap.state.status) && comparisons.source && comparisons.title && comparisons.body
    && comparisons.visibility && comparisons.images && distinctTagIdentities(article.meta.tags) && distinctTagIdentities(post.tags);
  const remoteHash = velogRemoteHash(post);
  const reviewHash = digest({ version: 1, account, owner: user.id, postId: post.id, source: article.contentHash,
    journal: snap.hash, remote: remoteHash, comparisons });
  return { post, remoteHash, result: { ok: true, command: 'velog inspect', readOnly: true, postId: post.id,
    localStatus: snap.state.status, comparisons, visibility: { intended: article.meta.visibility, actual: visibility, intendedFlags, actualFlags },
    tags: { intended: article.meta.tags, actual: post.tags }, localImages: body.localImages,
    canReconcile, requiresTagAcceptance: !comparisons.tags, reviewHash } };
}
export async function inspectVelog(article, account, cwd, session = withVelogSession, request = fetch) {
  velogAccount(account);
  const file = journalPath(cwd, account, article.meta.id, false), snap = snapshot(file, account, article.meta.id);
  return session(account, (client, user) => inspectSnapshot(article, account, snap, client, user, request).then(x => x.result));
}
function backupJournal(file, snap) {
  const parent = path.dirname(file), backup = file + '.backup-' + snap.hash + '.json'; let fd;
  try {
    const directory = lstatSync(parent);
    if (!directory.isDirectory() || directory.isSymbolicLink() || process.platform !== 'win32' && directory.mode & 0o077) throw Error('Unsafe directory');
    try { fd = openSync(backup, 'wx', 0o600); writeFileSync(fd, snap.bytes); fsyncSync(fd); closeSync(fd); fd = undefined; }
    catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const stat = lstatSync(backup);
      if (!stat.isFile() || stat.isSymbolicLink() || process.platform !== 'win32' && stat.mode & 0o077
        || digest(readBounded(backup, 64 * 1024)) !== snap.hash) throw Error('Unsafe backup');
      fd = openSync(backup, 'r'); fsyncSync(fd); closeSync(fd); fd = undefined;
    }
    if (process.platform !== 'win32') { fd = openSync(parent, 'r'); fsyncSync(fd); closeSync(fd); fd = undefined; }
  } catch { fail('VELOG_RECOVERY_BACKUP_FAILED', 'Cannot verify a private journal backup. The unresolved state was not replaced.'); }
  finally { if (fd !== undefined) closeSync(fd); }
}
export async function reconcileVelog(article, account, cwd, { confirmed = false, reviewHash, acceptTags = false } = {}, session = withVelogSession, request = fetch) {
  velogAccount(account);
  if (!confirmed) fail('VELOG_RECOVERY_CONFIRM_REQUIRED', 'Inspect the saved post, then explicitly confirm local reconciliation.');
  if (typeof reviewHash !== 'string' || !/^[a-f0-9]{64}$/.test(reviewHash)) fail('VELOG_RECOVERY_REVIEW_REQUIRED', 'Pass the review hash from velog inspect.');
  const file = journalPath(cwd, account, article.meta.id, false); snapshot(file, account, article.meta.id);
  return locked(file, async () => {
    const snap = snapshot(file, account, article.meta.id);
    if (!['unknown', 'pending'].includes(snap.state.status)) fail('VELOG_RECOVERY_STATE_INVALID', 'Only unresolved pending/unknown journals can be reconciled.');
    return session(account, async (client, user) => {
      const checked = await inspectSnapshot(article, account, snap, client, user, request);
      if (checked.result.reviewHash !== reviewHash) fail('VELOG_RECOVERY_STALE', 'The reviewed source, journal or remote post changed. Inspect again.');
      if (!checked.result.canReconcile) fail('VELOG_RECOVERY_MISMATCH', 'Source, ownership, body, title, visibility and local images must match before reconciliation.');
      if (checked.result.requiresTagAcceptance && !acceptTags) fail('VELOG_RECOVERY_TAG_ACCEPT_REQUIRED', 'Review the displayed remote tags and pass --accept-tags only if you accept that difference.');
      if (snapshot(file, account, article.meta.id).hash !== snap.hash) fail('VELOG_RECOVERY_STALE', 'The local journal changed during review. Inspect again.');
      backupJournal(file, snap);
      saveJournal(file, { ...snap.state, status: 'succeeded', remoteHash: checked.remoteHash, recoveredContentHash: contentHashForTargets(article, ['velog']) });
      return { ok: true, command: 'velog reconcile', postId: snap.state.postId, localStatus: 'succeeded', remoteWritten: false,
        acceptedTags: checked.result.requiresTagAcceptance, backupVerified: true };
    });
  });
}
