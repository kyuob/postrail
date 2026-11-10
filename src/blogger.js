import { parseFragment } from 'parse5';
import { fail, contentHashForTargets } from './core.js';
import { accountName, numericId } from './blogger-client.js';
import { withBloggerSession } from './blogger-auth.js';
import { digest, journalPath, readJournal, savePrivate, locked } from './blogger-storage.js';

export function checkArticle(article, pushing = false) {
  const blockers = [];
  if (article.meta.visibility === 'private') blockers.push('BLOGGER_PRIVATE_UNSUPPORTED');
  if ([...article.images.values()].some(i => i.kind === 'local')) blockers.push('BLOGGER_LOCAL_IMAGE_UNSUPPORTED');
  if (pushing && blockers.length) fail(blockers[0], 'Blogger supports draft/public and remote image URLs here. Private posts and local image uploads are not implemented.');
  return blockers;
}
export function htmlValue(html) {
  function node(n) {
    if (n.nodeName === '#text') return n.value;
    if (n.nodeName === '#comment') return ['comment', n.data];
    return [n.tagName ?? 'root', (n.attrs ?? []).map(a => [a.name, a.value]).sort((a, b) => a[0].localeCompare(b[0])), (n.childNodes ?? []).map(node)];
  }
  return node(parseFragment(html));
}
function postIdentity(post, blogId, id) {
  if (!post || post.kind !== 'blogger#post' || typeof post.id !== 'string' || !/^[0-9]{1,30}$/.test(post.id) || id && post.id !== id
    || post.blog?.id !== blogId) fail('BLOGGER_RESPONSE_INVALID', 'Google did not confirm the expected blog and post identity.');
  return post;
}
export function postResult(post, blogId, id) {
  postIdentity(post, blogId, id);
  if (!['DRAFT', 'LIVE'].includes(post.status) || typeof post.title !== 'string' || typeof post.content !== 'string'
    || !Array.isArray(post.labels ?? []) || (post.labels ?? []).some(t => typeof t !== 'string') || typeof post.etag !== 'string' || !post.etag || /[\r\n]/.test(post.etag)) fail('BLOGGER_RESPONSE_INVALID', 'Google did not confirm the expected blog, post identity, status and content.');
  return post;
}
export const remoteHash = post => digest({ id: post.id, blog: post.blog.id, title: post.title, content: post.content, labels: [...(post.labels ?? [])].sort(), status: post.status,
  etag: post.etag, published: post.published ?? null, updated: post.updated ?? null, location: post.location ?? null, customMetaData: post.customMetaData ?? null });
function verifyContent(post, input) {
  if (post.title !== input.title || JSON.stringify(htmlValue(post.content)) !== JSON.stringify(htmlValue(input.content))
    || JSON.stringify([...(post.labels ?? [])].sort()) !== JSON.stringify([...input.labels].sort())) fail('BLOGGER_READBACK_FAILED', 'The post readback differs from the requested title, HTML or labels.');
}
export function verifyUser(user) { if (typeof user?.id !== 'string' || !/^[0-9]{1,30}$/.test(user.id)) fail('BLOGGER_ACCOUNT_MISMATCH', 'The session did not confirm a Blogger user.'); }
export function checkBlogger(article) {
  const blockers = checkArticle(article);
  return { ok: true, command: 'blogger check', offline: true, articleId: article.meta.id, visibility: article.meta.visibility, canPush: !blockers.length, blockers, liveVerified: false };
}
export function statusBlogger(article, account, blogId, cwd) {
  accountName(account); numericId(blogId);
  const state = readJournal(journalPath(cwd, account, blogId, article.meta.id, false), account, blogId, article.meta.id);
  return { ok: true, command: 'blogger status', offline: true, account, blogId, articleId: article.meta.id,
    state: state ? { status: state.status, postId: state.postId, contentHash: state.contentHash } : { status: 'not_submitted' } };
}
export async function blogsBlogger(account, session = withBloggerSession) {
  accountName(account);
  return session(account, async (client, user) => { verifyUser(user); return { ok: true, command: 'blogger blogs', account, blogs: await client.blogs(), liveVerified: false }; });
}
export async function getBlogger(article, account, blogId, cwd, session = withBloggerSession) {
  accountName(account); numericId(blogId);
  const old = readJournal(journalPath(cwd, account, blogId, article.meta.id, false), account, blogId, article.meta.id);
  if (!old?.postId) fail('BLOGGER_NO_REMOTE_ID', 'No saved post ID exists for this article, account and blog.');
  return session(account, async (client, user) => {
    verifyUser(user); if (user.id !== old.userId) fail('BLOGGER_ACCOUNT_MISMATCH', 'The journal belongs to another Blogger user.');
    await client.target(blogId, user.id); const post = postResult(await client.read(blogId, old.postId), blogId, old.postId);
    return { ok: true, command: 'blogger get', postId: post.id, visibility: post.status === 'DRAFT' ? 'draft' : 'public', localStatus: old.status, matchesLastSaved: remoteHash(post) === old.remoteHash, liveVerified: false };
  });
}
export async function pushBlogger(article, account, blogId, cwd, confirmed, session = withBloggerSession) {
  accountName(account); numericId(blogId);
  if (!confirmed) fail('BLOGGER_CONFIRM_REQUIRED', 'Review the article, account, blog and visibility, then pass --confirm.');
  checkArticle(article, true);
  const input = { title: article.meta.title, content: article.md.renderer.render(article.tokens, article.md.options, {}), labels: article.meta.tags };
  const file = journalPath(cwd, account, blogId, article.meta.id, true);
  return locked(file, async () => {
    const old = readJournal(file, account, blogId, article.meta.id);
    if (old && old.status !== 'succeeded') fail('BLOGGER_UNKNOWN_RESULT', 'A previous write is unresolved. Inspect Blogger before retrying; automatic recreation is blocked.');
    return session(account, async (client, user) => {
      verifyUser(user); if (old && old.userId !== user.id) fail('BLOGGER_ACCOUNT_MISMATCH', 'The saved post belongs to another Blogger user.');
      await client.target(blogId, user.id);
      let current;
      if (old) {
        current = postResult(await client.read(blogId, old.postId), blogId, old.postId);
        if (remoteHash(current) !== old.remoteHash) fail('BLOGGER_REMOTE_CONFLICT', 'The remote post changed outside Postrail. Resolve it before updating.');
        if (old.contentHash === article.contentHash || old.recoveredContentHash === contentHashForTargets(article, ['blogger'])) return { ok: true, command: 'blogger push', skipped: true, postId: old.postId, liveVerified: false };
      }
      const state = { version: 1, account, userId: user.id, blogId, articleId: article.meta.id, contentHash: article.contentHash, postId: old?.postId, status: 'pending' };
      savePrivate(file, state);
      try {
        const desired = article.meta.visibility === 'draft' ? 'DRAFT' : 'LIVE';
        let editing = current;
        // Remove public visibility before writing new draft content, including failure paths.
        if (editing?.status === 'LIVE' && desired === 'DRAFT') {
          postIdentity(await client.transition(blogId, editing.id, false, editing.etag), blogId, editing.id);
          editing = postResult(await client.read(blogId, editing.id), blogId, editing.id);
          verifyContent(editing, { title: current.title, content: current.content, labels: current.labels ?? [] });
          if (editing.status !== 'DRAFT') fail('BLOGGER_READBACK_FAILED', 'Google did not confirm draft status before editing. No new draft content was sent.');
        }
        const saved = postIdentity(old ? await client.patch(blogId, old.postId, input, editing.etag) : await client.insert(blogId, input), blogId, old?.postId);
        state.postId = saved.id; savePrivate(file, state);
        let actual = postResult(await client.read(blogId, saved.id), blogId, saved.id);
        verifyContent(actual, input);
        if (actual.status !== (editing?.status ?? 'DRAFT')) fail('BLOGGER_READBACK_FAILED', 'Creation or content update unexpectedly changed publication status.');
        if (actual.status !== desired) {
          postIdentity(await client.transition(blogId, actual.id, desired === 'LIVE', actual.etag), blogId, actual.id);
          actual = postResult(await client.read(blogId, actual.id), blogId, actual.id); verifyContent(actual, input);
        }
        if (actual.status !== desired) fail('BLOGGER_READBACK_FAILED', 'Google did not confirm the requested draft/public state.');
        savePrivate(file, { ...state, status: 'succeeded', remoteHash: remoteHash(actual) });
        return { ok: true, command: 'blogger push', postId: actual.id, blogId, updated: !!old, visibility: article.meta.visibility, readbackVerified: true, liveVerified: false };
      } catch (e) {
        savePrivate(file, { ...state, status: 'unknown' });
        if (e.code?.startsWith('BLOGGER_')) throw e;
        fail('BLOGGER_UNKNOWN_RESULT', 'Google did not confirm the complete result. Inspect local and remote state before retrying.');
      }
    });
  });
}
