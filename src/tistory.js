import { fail } from './core.js';
import { tistoryTarget, withTistorySession } from './tistory-client.js';
import { hash, journalPath, readJournal, saveJournal, locked } from './tistory-storage.js';
import { attachment, renderTistory, canonicalHtml } from './tistory-format.js';
import { equivalentTags } from './tags.js';

function validateTarget(target) {
  const expected = tistoryTarget(target?.blog, target?.blogId);
  if (target.host !== expected.host || target.origin !== expected.origin) fail('TISTORY_BLOG_MISMATCH', 'The requested blog identity is inconsistent.');
}
function checkArticle(article, pushing = false) {
  if (article.meta.visibility === 'draft' && pushing) fail('TISTORY_DRAFT_UNSUPPORTED', 'Tistory draft slots are not implemented. Keep draft unchanged, or explicitly choose private/public in the source after review.');
  if (article.meta.tags.some(t => t.includes(','))) fail('TISTORY_TAG_UNSUPPORTED', 'Tistory comma-separated tags cannot preserve a tag containing a comma.');
  // Do not allow platform image substitution syntax in authored text to create untracked attachment references.
  if (article.body.includes('[##_')) fail('TISTORY_MARKUP_UNSUPPORTED', 'Platform substitution syntax is not supported in source Markdown.');
  function inspect(tokens) {
    for (const token of tokens) {
      if (token.content?.includes('[##_')) fail('TISTORY_MARKUP_UNSUPPORTED', 'Decoded platform substitution syntax is not supported in source Markdown.');
      if (token.children) inspect(token.children);
    }
  }
  inspect(article.tokens);
  // Validate local image rendering before any upload. Placeholders never leave offline checks.
  renderTistory(article, new Map([...article.images].filter(([, i]) => i.kind === 'local').map(([src]) => [src, 'kage@offline/image.png?offline=1'])));
}
function verifyIdentity(actual, target) {
  if (!actual || actual.blog !== target.blog || actual.blogId !== target.blogId || actual.host !== target.host) fail('TISTORY_BLOG_MISMATCH', 'The session does not match the requested blog.');
}
function verifyPost(post, id) {
  if (!post || post.id !== id || typeof post.title !== 'string' || typeof post.content !== 'string' || ![0, 20].includes(post.visibility)
    || !Array.isArray(post.tags) || post.tags.some(t => typeof t !== 'string') || typeof post.slogan !== 'string'
    || !Number.isSafeInteger(post.category) || post.category < 0 || !post.editor || typeof post.editor !== 'object') fail('TISTORY_RESPONSE_INVALID', 'Readback did not confirm the requested post fields.');
  return post;
}
const remoteHash = post => hash(post.editor);
const formatVersion = 'paragraph-spacing-1';
export function checkTistory(article) {
  checkArticle(article);
  return { ok: true, command: 'tistory check', offline: true, articleId: article.meta.id, visibility: article.meta.visibility,
    canPush: article.meta.visibility !== 'draft', blockers: article.meta.visibility === 'draft' ? ['TISTORY_DRAFT_UNSUPPORTED'] : [],
    localImages: [...article.images.values()].filter(i => i.kind === 'local').length, liveVerified: false };
}
export function statusTistory(article, target, cwd) {
  validateTarget(target);
  const state = readJournal(journalPath(cwd, target, article.meta.id, false), target, article.meta.id);
  return { ok: true, command: 'tistory status', offline: true, blog: target.blog, blogId: target.blogId, articleId: article.meta.id,
    state: state ? { status: state.status, postId: state.postId, contentHash: state.contentHash } : { status: 'not_submitted' } };
}
export async function loginTistory(target, session = withTistorySession) {
  validateTarget(target);
  return session(target, async (_client, actual) => { verifyIdentity(actual, target); return { ok: true, command: 'tistory login', blog: target.blog, blogId: target.blogId, liveVerified: false }; }, { login: true });
}
export async function getTistory(article, target, cwd, session = withTistorySession) {
  validateTarget(target);
  const old = readJournal(journalPath(cwd, target, article.meta.id, false), target, article.meta.id);
  if (!old?.postId) fail('TISTORY_NO_REMOTE_ID', 'No saved post ID exists for this article and blog.');
  return session(target, async (client, actual) => {
    verifyIdentity(actual, target); const post = verifyPost(await client.read(old.postId), old.postId);
    return { ok: true, command: 'tistory get', postId: post.id, visibility: post.visibility === 0 ? 'private' : 'public', matchesLastSaved: remoteHash(post) === old.remoteHash, localStatus: old.status, liveVerified: false };
  });
}
export async function pushTistory(article, target, cwd, confirmed, session = withTistorySession) {
  validateTarget(target);
  if (!confirmed) fail('TISTORY_CONFIRM_REQUIRED', 'Review the article, blog and visibility, then pass --confirm to send content.');
  checkArticle(article, true);
  const file = journalPath(cwd, target, article.meta.id, true);
  return locked(file, async () => {
    const old = readJournal(file, target, article.meta.id);
    if (old && old.status !== 'succeeded') fail('TISTORY_UNKNOWN_RESULT', 'An earlier write is unresolved. Inspect Tistory before retrying; automatic recreation is blocked.');
    return session(target, async (client, actual) => {
      verifyIdentity(actual, target);
      let current;
      if (old) {
        current = verifyPost(await client.read(old.postId), old.postId);
        if (remoteHash(current) !== old.remoteHash) fail('TISTORY_REMOTE_CONFLICT', 'The remote editor state changed outside Postrail. Resolve it before updating.');
        if (old.contentHash === article.contentHash && old.formatVersion === formatVersion) return { ok: true, command: 'tistory push', skipped: true, postId: old.postId, liveVerified: false };
      }
      const state = { version: 1, blog: target.blog, blogId: target.blogId, articleId: article.meta.id, contentHash: article.contentHash, formatVersion, postId: old?.postId, status: 'pending' };
      saveJournal(file, state);
      try {
        const uploaded = new Map();
        for (const image of article.images.values()) {
          if (image.kind !== 'local') continue;
          const ext = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' }[image.mime];
          uploaded.set(image.source, attachment(await client.upload(image, `image-${uploaded.size}.${ext}`)));
        }
        const content = renderTistory(article, uploaded);
        const input = { id: old?.postId ?? '0', title: article.meta.title, content, visibility: article.meta.visibility === 'private' ? 0 : 20,
          category: current?.category ?? 0, slogan: current?.slogan ?? '', tag: article.meta.tags.join(','), published: 1, type: 'post',
          password: '', uselessMarginForEntry: current?.editorOptions?.uselessMarginForEntry ?? 1,
          cclCommercial: current?.editorOptions?.cclCommercial ?? 0, cclDerive: current?.editorOptions?.cclDerive ?? 0,
          attachments: [...uploaded.values()], recaptchaValue: '', draftSequence: null, totalWritingTimeMs: 0 };
        const saved = await client.write(input, old?.postId);
        if (!saved || typeof saved.postId !== 'string' || !/^[1-9][0-9]{0,15}$/.test(saved.postId) || old && saved.postId !== old.postId) fail('TISTORY_RESPONSE_INVALID', 'No matching saved post identity was returned.');
        state.postId = saved.postId; saveJournal(file, state);
        const post = verifyPost(await client.read(saved.postId), saved.postId);
        if (post.title !== input.title || canonicalHtml(post.content) !== canonicalHtml(content) || post.visibility !== input.visibility || post.category !== input.category
          || !equivalentTags(post.tags, article.meta.tags) || current && post.slogan !== input.slogan)
          fail('TISTORY_READBACK_FAILED', 'The editor readback differs from the requested content or state.');
        for (const key of ['uselessMarginForEntry', 'cclCommercial', 'cclDerive']) {
          if (current && post.editorOptions?.[key] !== input[key]) fail('TISTORY_READBACK_FAILED', 'An existing editor option was not preserved.');
        }
        saveJournal(file, { ...state, status: 'succeeded', remoteHash: remoteHash(post) });
        return { ok: true, command: 'tistory push', postId: post.id, url: `${target.origin}/${post.id}`, visibility: article.meta.visibility, updated: !!old, readbackVerified: true, liveVerified: false };
      } catch (e) {
        saveJournal(file, { ...state, status: 'unknown' });
        if (e.code?.startsWith('TISTORY_')) throw e;
        fail('TISTORY_UNKNOWN_RESULT', 'The complete result was not confirmed. Inspect local and remote state before retrying.');
      }
    });
  });
}
