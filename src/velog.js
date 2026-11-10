import { fail, contentHashForTargets } from "./core.js";
import { digest, journalPath, readJournal, saveJournal, locked } from "./velog-journal.js";
import { velogAccount, withVelogSession } from "./velog-client.js";
import { velogImages, replaceVelogImages } from "./velog-images.js";
import { equivalentTags, distinctTagIdentities } from './tags.js';

function flags(article) { return { is_temp: article.meta.visibility === "draft", is_private: article.meta.visibility !== "public" }; }
function validateUser(user, account) {
  if (!user || user.username !== account || typeof user.id !== "string" || !user.id) fail("VELOG_ACCOUNT_MISMATCH", "The session does not match the requested Velog author.");
}
function validatePostIdentity(post, user, expectedId) {
  if (!post || typeof post.id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(post.id) || post.user?.id !== user.id || post.user?.username !== user.username
    || expectedId && post.id !== expectedId) fail("VELOG_RESPONSE_INVALID", "Velog did not confirm the expected owned post identity.");
  return post;
}
function validatePost(post, user) {
  validatePostIdentity(post, user);
  if (typeof post.title !== "string" || typeof post.body !== "string" || !Array.isArray(post.tags) || post.tags.some(t => typeof t !== "string")
    || typeof post.is_temp !== "boolean" || typeof post.is_private !== "boolean" || typeof post.url_slug !== "string" || !post.url_slug || post.url_slug.length > 1000) fail("VELOG_RESPONSE_INVALID", "Velog did not confirm an owned post with the expected fields.");
  return post;
}
function remoteHash(post) {
  return digest({ title: post.title, body: post.body, tags: [...post.tags].sort(), is_temp: post.is_temp, is_private: post.is_private,
    slug: post.url_slug, thumbnail: post.thumbnail ?? null, summary: post.short_description ?? "", series: post.series?.id ?? null });
}
function identity(post, account) { return { postId: post.id, url: `https://velog.io/@${account}/${encodeURIComponent(post.url_slug)}` }; }
function checkTags(article) {
  if (!distinctTagIdentities(article.meta.tags)) fail('VELOG_TAG_COLLISION', 'Tags must remain distinct ignoring ASCII letter casing. Review tags such as CLI and cli before sending.');
}

export function checkVelog(article) {
  checkTags(article);
  const images = velogImages(article);
  return { ok: true, command: "velog check", offline: true, articleId: article.meta.id, visibility: article.meta.visibility, ...flags(article), localImages: new Set(images.map(i => i.source)).size, liveVerified: false };
}
export function statusVelog(article, account, cwd) {
  velogAccount(account);
  const state = readJournal(journalPath(cwd, account, article.meta.id, false), account, article.meta.id);
  return { ok: true, command: "velog status", offline: true, articleId: article.meta.id, account,
    state: state ? { status: state.status, postId: state.postId, contentHash: state.contentHash } : { status: "not_submitted" } };
}
export async function loginVelog(account, session = withVelogSession, { diagnostics = false } = {}) {
  velogAccount(account);
  return session(account, async (_client, user) => { validateUser(user, account); return { ok: true, command: "velog login", account, liveVerified: false }; }, { login: true, ...(diagnostics ? { diagnostics: true } : {}) });
}
export async function getVelog(article, account, cwd, session = withVelogSession) {
  velogAccount(account);
  const old = readJournal(journalPath(cwd, account, article.meta.id, false), account, article.meta.id);
  if (!old?.postId) fail("VELOG_NO_REMOTE_ID", "No saved Velog post ID exists for this article and account.");
  return session(account, async (client, user) => {
    validateUser(user, account);
    if (old.ownerId !== user.id) fail("VELOG_ACCOUNT_MISMATCH", "The journal belongs to another Velog author.");
    const post = validatePost(await client.read(old.postId), user);
    if (post.id !== old.postId) fail("VELOG_RESPONSE_INVALID", "Velog returned a different post ID.");
    return { ok: true, command: "velog get", ...identity(post, account), visibility: post.is_temp ? "draft" : post.is_private ? "private" : "public", matchesLastSaved: remoteHash(post) === old.remoteHash, localStatus: old.status };
  });
}
export async function pushVelog(article, account, cwd, confirmed, session = withVelogSession) {
  velogAccount(account);
  if (!confirmed) fail("VELOG_CONFIRM_REQUIRED", "Review the article, author and visibility, then pass --confirm to send it to Velog.");
  checkTags(article);
  const references = velogImages(article);
  const file = journalPath(cwd, account, article.meta.id, true);
  return locked(file, async () => {
    const old = readJournal(file, account, article.meta.id);
    if (old && ["pending", "unknown"].includes(old.status)) fail("VELOG_UNKNOWN_RESULT", "An earlier operation is unresolved. Inspect Velog before retrying; automatic re-creation is blocked.");
    return session(account, async (client, user) => {
      validateUser(user, account);
      let current;
      if (old) {
        if (old.ownerId !== user.id) fail("VELOG_ACCOUNT_MISMATCH", "The journal belongs to another Velog author.");
        current = validatePost(await client.read(old.postId), user);
        if (current.id !== old.postId) fail("VELOG_RESPONSE_INVALID", "Velog returned a different post ID.");
        if (remoteHash(current) !== old.remoteHash) fail("VELOG_REMOTE_CONFLICT", "The remote article was changed outside Postrail. Resolve that conflict before updating.");
        if (old.contentHash === article.contentHash || old.recoveredContentHash === contentHashForTargets(article, ['velog'])) return { ok: true, command: "velog push", skipped: true, ...identity(current, account), liveVerified: false };
      }
      const state = { version: 1, articleId: article.meta.id, account, ownerId: user.id, status: "pending", contentHash: article.contentHash, postId: old?.postId };
      saveJournal(file, state);
      try {
        const urls = new Map();
        for (const ref of references) {
          if (urls.has(ref.source)) continue;
          const image = article.images.get(ref.source);
          const extension = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" }[image.mime];
          urls.set(ref.source, await client.upload(image, `image-${urls.size}.${extension}`));
        }
        const body = replaceVelogImages(article, references, urls);
        const input = { title: article.meta.title, body, tags: article.meta.tags, is_markdown: true, ...flags(article), url_slug: current?.url_slug ?? `${article.meta.id}-${digest([account, article.meta.id]).slice(0, 8)}`,
          thumbnail: current?.thumbnail ?? null, meta: { short_description: current?.short_description ?? "" }, series_id: current?.series?.id ?? null, token: null, ...(old?.postId ? { id: old.postId } : {}) };
        const retainIdentity = candidate => {
          validatePostIdentity(candidate, user, old?.postId);
          state.postId = candidate.id;
          saveJournal(file, state); // Identity can survive incomplete content or GraphQL field errors.
        };
        const response = await client.write(input, !!old, retainIdentity);
        retainIdentity(response);
        const saved = validatePost(response, user);
        const actual = validatePost(await client.read(saved.id), user);
        const intended = { ...saved, title: input.title, body, tags: input.tags, ...flags(article),
          ...(current ? { url_slug: input.url_slug, thumbnail: input.thumbnail, short_description: input.meta.short_description,
            series: input.series_id ? { id: input.series_id } : null } : {}) };
        if (actual.id !== saved.id || !equivalentTags(actual.tags, intended.tags)
          || remoteHash(actual) !== remoteHash({ ...intended, tags: actual.tags })) fail("VELOG_READBACK_FAILED", "Velog's readback does not match the intended content and state.");
        saveJournal(file, { ...state, status: "succeeded", remoteHash: remoteHash(actual) });
        return { ok: true, command: "velog push", ...identity(actual, account), updated: !!old, visibility: article.meta.visibility, readbackVerified: true, liveVerified: false };
      } catch (error) {
        saveJournal(file, { ...state, status: "unknown" });
        if (error.code?.startsWith("VELOG_")) throw error;
        fail("VELOG_UNKNOWN_RESULT", "Velog did not confirm the complete result. Inspect local and remote state before retrying.");
      }
    });
  });
}

export { validateUser as validateVelogUser, validatePost as validateVelogPost, remoteHash as velogRemoteHash, flags as velogVisibilityFlags };
